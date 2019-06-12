const _ = require('lodash')
const spotify = require('./spotify-api')
const settings = require('./settings.js')

function stringify(track) {
  return `${track.artists.map(a => a.name).join(', ')} - ${track.name}`
}

function isGoodForRunning(track, feature) {
  if (feature.liveness > 0.8 && !artistsIntersect(track, settings.ARTISTS_ALLOWED_TO_BE_LIVE)) {
    return false
  }
  if (feature.energy < 0.3 || feature.valence < 0.3) {
    return false
  }
  const tempo = feature.tempo
  if (tempo >= 44.5 && tempo <= 45.5) {
    console.log("45 BPM track: %s", stringify(track))
    return true
  }
  return (tempo >= 178 && tempo <= 182) || (tempo >= 89 && tempo <= 91)
}

function makeTrackKey(track) {
  return JSON.stringify({
    name: track.name,
    artist: track.artists[0].id
  })
}

function dedupe(tracks) {
  // TODO(ehecht) find out why some tracks are coming back null
  return _(tracks).filter(t => t).groupBy(makeTrackKey).map(trackGroup => _.maxBy(trackGroup, track => !!track.explicit)).value()
}

function artistsIntersect(track, artists) {
  return _.intersection(track.artists.map(a => a.id), artists).length > 0
}

let bannedArtists
let bannedTrackKeys

async function loadBanlists() {
  const artistBanlistTracks = await spotify.getPlaylistTracks(settings.ARTIST_BANLIST)
  bannedArtists = _.flatten(artistBanlistTracks.map(t => t.artists)).map(a => a.id)
  const bannedTracks = await spotify.getPlaylistTracks(settings.TRACK_BANLIST)
  bannedTrackKeys = new Set(bannedTracks.map(makeTrackKey))
}

function filterForBans(tracks) {
  return tracks.filter(t => !bannedTrackKeys.has(makeTrackKey(t)) && !artistsIntersect(t, bannedArtists))
}

async function makePlaylist(isTest, lambdaCallback) {
  try {
    await spotify.authorize()
    let artists = await spotify.getFollowedArtists()
    if (isTest) {
      artists = [artists[0]]
    }

    const albums = _.flatten(await Promise.all(artists.map(artist => spotify.getAlbums(artist.id))))
      .filter(album => album.album_type != 'compilation')
    const albumTracks = _.flatten(await Promise.all(albums.map(album => spotify.getAlbumTracks(album.id))))
    const savedTracks = await spotify.getSavedTracks()

    const playlists = (await spotify.getPlaylists()).filter(pl => pl.id != settings.RUNNING_PLAYLIST)
    const playlistTracks = _.flatten(await Promise.all(playlists.map(async playlist => {
        return await spotify.getPlaylistTracks(playlist.id)
      })))

    await loadBanlists();
    const allDedupedTracks = filterForBans(dedupe(albumTracks.concat(savedTracks).concat(playlistTracks)))

    const features = await spotify.getAudioFeatures(allDedupedTracks.map(t => t.id))
    const featureMap = {}
    features.filter(f => f).forEach(f => featureMap[f.id] = f)
    const goodTracks = allDedupedTracks.filter(track => {
      const feature = featureMap[track.id]
      if (feature) {
        return isGoodForRunning(track, feature)
      } else {
        console.log('No analysis found for %s', stringify(track))
        return false
      }
    })

    await spotify.clearPlaylist()
    // This sorts by popularity but with a random factor, such that any track
    // has a chance of being ranked to the top, but more popular tracks are more
    // likely to appear higher up.
    const orderedTracks = _(goodTracks).sortBy(t => {
      const trackPopularity = t.popularity || 50
      const fuzzedPopularity = trackPopularity + (Math.random() * 200)
      console.log(`${stringify(t)}: true pop: ${t.popularity}, fuzzed: ${fuzzedPopularity}`)
      return fuzzedPopularity
    }).reverse().map(t => t.uri).value()
    await spotify.addTracksToPlaylist(orderedTracks)
    lambdaCallback( /* error= */ null, /* response= */ orderedTracks.length.toString())
  } catch (error) {
    lambdaCallback(error)
  }
}

exports.handler = async (event, context, callback) => {
  await makePlaylist( /* isTest= */ false, callback)
}

exports.makePlaylist = makePlaylist