module.exports = {
  // Should have at least the following scopes:
  // user-library-read user-follow-read playlist-modify-private playlist-read-private
  REFRESH_TOKEN: '',
  CLIENT_ID: '',
  CLIENT_SECRET: '',
  ARTIST_BANLIST: '', // Playlist of artists who should never appear in the running playlist
  TRACK_BANLIST: '', // Ditto, but for individual tracks
  RUNNING_PLAYLIST: '', // Playlist this program should write to (should be private)
  ARTISTS_ALLOWED_TO_BE_LIVE: [ // Usually we ban live tracks, but not for these artists.
   '4TMHGUX5WI7OOm53PqSDAT', // Grateful Dead
  ]
}