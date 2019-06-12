const chai = require('chai')
const expect = chai.expect
const assert = chai.assert
const mock = require('mock-require')
const settings = require('../settings.js')

const NO_OP = () => {}

describe('run', () => {

  let spotifyMock
  let savedTracks

  let followedPlaylists
  let followedArtists
  let libraryTracks
  let playlistTracks
  let artistAlbums
  let albumTracks
  let index
  let audioFeatures

  beforeEach(() => {
    followedPlaylists = []
    followedArtists = []
    libraryTracks = []
    playlistTracks = {}
    artistAlbums = {}
    albumTracks = {}
    savedTracks = []
    audioFeatures = {}

    spotifyMock = {
      getSavedTracks: () => libraryTracks,
      addTracksToPlaylist: trackIds => {
        savedTracks = savedTracks.concat(trackIds)
      },
      getFollowedArtists: () => Promise.resolve(followedArtists),
      getAlbums: artistId => Promise.resolve(artistAlbums[artistId] || []),
      getAlbumTracks: albumId => Promise.resolve(albumTracks[albumId] || []),
      getPlaylists: () => Promise.resolve(followedPlaylists),
      getPlaylistTracks: playlistId => {
        if (!playlistId) {
          throw 'bad playlist id'
        }
        return Promise.resolve(playlistTracks[playlistId] || [])
      },
      getAudioFeatures: trackIds => Promise.resolve(trackIds.map(id => {
        return audioFeatures[id] || {
          id,
          tempo: 180
        }
      })),
      authorize: NO_OP,
      clearPlaylist: NO_OP
    }

    mock('../spotify-api.js', spotifyMock)
  })

  async function run() {
    index = mock.reRequire('../index.js')
    let error = false
    await index.makePlaylist( /* isTest= */ false, /* lambdaCallback= */ (err, resp) => {
      error = err
    })
    if (error) {
      console.log(error)
      assert.fail(error)
    }
  }

  function makeTrack(id) {
    return {
      id,
      uri: 'uri:' + id,
      name: id,
      artists: [{
        id: 'some artist'
      }]
    }
  }

  function setUpPlaylistWithTrack(trackId, playlistId) {
    const track = makeTrack(trackId)
    playlistId = playlistId || 'playlist1'
    followedPlaylists = [{
      id: playlistId
    }]
    playlistTracks[playlistId] = [track]
    return track
  }

  it('adds a playlist track', async () => {
    setUpPlaylistWithTrack(/* trackId= */ '1', /* playlistId= */ settings.RUNNING_PLAYLIST)

    await run()

    expect(savedTracks).to.be.empty
  })

  it('adds a library track if there is also a playlist track', async () => {
    const playlistTrack = setUpPlaylistWithTrack('1')
    const libraryTrack = makeTrack('2')
    libraryTracks.push(libraryTrack)

    await run()

    expect(savedTracks).to.include(playlistTrack.uri)
    expect(savedTracks).to.include(libraryTrack.uri)
  })

  it('adds an artist track if there is also a playlist track', async () => {
    const playlistTrack = setUpPlaylistWithTrack('1')
    const artistTrack = makeTrack('2')
    followedArtists.push({
      id: 'artist1'
    })
    artistAlbums['artist1'] = [{
      'id': 'album1'
    }]
    albumTracks['album1'] = [artistTrack]

    await run()

    expect(savedTracks).to.include(playlistTrack.uri)
    expect(savedTracks).to.include(artistTrack.uri)
  })

  it('removes banned tracks', async () => {
    const track = setUpPlaylistWithTrack('1')
    audioFeatures[track.id] = {
      id: track.id,
      tempo: 180,
      liveness: 1
    }
    playlistTracks[settings.TRACK_BANLIST] = [track]

    await run()

    expect(savedTracks).to.be.empty
  })

  it('allows live tracks if they are Grateful Dead', async () => {
    const track = setUpPlaylistWithTrack('1')
    track.artists = [{
      id: settings.ARTISTS_ALLOWED_TO_BE_LIVE[0]
    }]
    audioFeatures['1'] = {
      id: '1',
      tempo: 180,
      liveness: 1
    }

    await run()

    expect(savedTracks).to.include(track.uri)
  })

  it('tolerates missing audio features', async () => {
    spotifyMock.getAudioFeatures = () => [null]
    setUpPlaylistWithTrack('1')

    await run()

    expect(savedTracks).to.be.empty
  })

  it('prefers the explicit version of a song', async () => {
    const censoredTrack = makeTrack('1')
    const explicitTrack = makeTrack('2')
    censoredTrack.name = explicitTrack.name = 'Track name'
    censoredTrack.explicit = false
    explicitTrack.explicit = true
    followedPlaylists = [{
      id: 'playlist'
    }]
    playlistTracks['playlist'] = [censoredTrack, explicitTrack]

    await run()

    expect(savedTracks).to.include(explicitTrack.uri)
  })

  it('allows 45 BPM', async () => {
    const track = setUpPlaylistWithTrack('1')
    audioFeatures[track.id] = {
      id: track.id,
      tempo: 45
    }

    await run()

    expect(savedTracks).to.include(track.uri)
  })

})