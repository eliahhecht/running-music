const got = require('got')
const Promise = require('bluebird')
const _ = require('lodash')
const settings = require('./settings.js')

let authToken

const authorize = async () => {
  try {
    const resp = await got.post('https://accounts.spotify.com/api/token', {
      query: {
        grant_type: 'refresh_token',
        refresh_token: settings.REFRESH_TOKEN
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + (new Buffer(settings.CLIENT_ID + ':' + settings.CLIENT_SECRET).toString('base64'))
      },
      json: true
    })
    authToken = resp.body.access_token
  } catch (error) {
    console.log(error)
  }
}

const makeAuthHeader = () => {
  return {
    'Authorization': 'Bearer ' + authToken
  }
}

// latch to make sure we don't try to kick off more requests if we're already being throttled
let waitingFor429 = false

async function get(url, params) {
  console.log('fetching ' + url)
  try {
    while (waitingFor429) {
      await Promise.delay(100)
    }
    const resp = await got(url, {
      headers: makeAuthHeader(),
      query: params,
      json: true
    })
    return resp.body
  } catch (error) {
    if (error.statusCode == 429) {
      const retryAfterSeconds = parseInt(error.headers['retry-after'], 10)
      console.log('caught 429, retrying after ' + retryAfterSeconds)
      waitingFor429 = true
      await Promise.delay(retryAfterSeconds * 1000)
      waitingFor429 = false
      return await get(url, params)
    } else {
      console.log(error)
    }
  }
}

async function paginatedGet(options) {
  resultsSoFar = options.resultsSoFar || []
  resultSelector = options.resultSelector || (x => x)
  const resp = await get(options.url, options.gotOptions)
  const results = resultSelector(resp)
  resultsSoFar = resultsSoFar.concat(results.items)
  if (results.next) {
    console.log('paging...')
    return paginatedGet({
      url: results.next,
      resultSelector,
      resultsSoFar
      // Can't pass options here because with my current implementation of get, any query params in 'next' would get
      // blown away by what I pass in. But fortunately it's OK, because the 'next' URL already remembers my limit setting 
      // from the initial request.
    })
  } else {
    console.log('pagination complete')
    return resultsSoFar
  }

}

const getFollowedArtists = async () => {
  return await paginatedGet({
    url: 'https://api.spotify.com/v1/me/following?type=artist',
    resultSelector: resp => resp.artists
  })
}

const getPlaylists = async () => {
  const results = await paginatedGet({
    url: 'https://api.spotify.com/v1/me/playlists'
  })
  console.log(`playlists: ${JSON.stringify(results.map(pl => pl.name))}`)
  return results
}

const getPlaylistTracks = async (playlistId) => {
  const results = await paginatedGet({
    url: 'https://api.spotify.com/v1/playlists/' + playlistId + '/tracks'
  })
  return results.map(pt => pt.track)
}

const getAlbums = async (artistId) => {
  const url = 'https://api.spotify.com/v1/artists/' + artistId + '/albums'
  const resp = await get(url, {
    country: 'us'
  })
  return resp.items
}

const getAlbumTracks = async (albumId) => {
  const url = 'https://api.spotify.com/v1/albums/' + albumId + '/tracks'
  const resp = await get(url)
  return resp.items
}

const getAudioFeatures = async (trackIds) => {
  const features = _.flatten(await Promise.all(_.chunk(trackIds, 100).map(async idBatch => {
    try {
      const url = "https://api.spotify.com/v1/audio-features/?ids=" + _.join(idBatch, ',')
      const resp = await get(url)
      return resp.audio_features
    } catch (error) {
      console.log(error)
    }
  })))
  return features
}

const clearPlaylist = async () => {
  const url = 'https://api.spotify.com/v1/playlists/' + settings.RUNNING_PLAYLIST + '/tracks'
  await got.put(url, {
    headers: makeAuthHeader(),
    query: {
      uris: []
    }
  })
}

const addTracksToPlaylist = async (trackUris) => {
  const url = 'https://api.spotify.com/v1/playlists/' + settings.RUNNING_PLAYLIST + '/tracks'
  // In theory the API can accept up to 100 URIs in a batch, but I can't figure out how to make the calls work
  // if I try to put the data in the request body, so I put them in the querystring instead. Experimentally,
  // 100 IDs makes the querystring too long; 50 seems to work.
  const chunks = _.chunk(trackUris, 50)
  // Playlist writes need to be linearized or else we get 500s, so we can't just kick off all the promises at once
  // like we do elsewhere.
  for (let chunkIndex in chunks) {
    await got.post(url, {
      headers: makeAuthHeader(),
      query: {
        uris: chunks[chunkIndex]
      }
    });
  }
}

const getSavedTracks = async () => {
  const results = await paginatedGet({
    url: 'https://api.spotify.com/v1/me/tracks',
    gotOptions: {
      limit: 50
    }
  })
  return results.map(st => st.track)
}

exports.authorize = authorize
exports.getFollowedArtists = getFollowedArtists
exports.getAlbums = getAlbums
exports.getAlbumTracks = getAlbumTracks
exports.getAudioFeatures = getAudioFeatures
exports.clearPlaylist = clearPlaylist
exports.addTracksToPlaylist = addTracksToPlaylist
exports.getPlaylists = getPlaylists
exports.getPlaylistTracks = getPlaylistTracks
exports.getSavedTracks = getSavedTracks