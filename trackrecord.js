var rem = require('rem');
var sp = require('libspotify');
var fs = require('fs');
var http = require('http');
var spawn = require('child_process').spawn;
var keypress = require('keypress'); 
var spotifySession;

/*
 * Beings a spotify session
 */
function connectSpotify (callback) {
  // Create a spotify session wth our api key
  spotifySession = new sp.Session({
    applicationKey: process.env.SPOTIFY_KEYPATH
  });

  console.log("Connecting to Spotify...")
  // Log in with our credentials
  spotifySession.login(process.env.SPOTIFY_USERNAME, process.env.SPOTIFY_PASSWORD);

  var player = spotifySession.getPlayer();  

  // Once we're logged in, continue with the callback
  spotifySession.once('login', function (err) {
    if (err) return console.error('Error:', err);
    callback(spotifySession);
  });
}


 /*
  * Convert JSON to spotify streams and play it
  */
function beginPlayingTracks(JSONTracks) {
  convertJSONTracksToSpotifyTracks(JSONTracks.tracks, beginTrackPlayQueue)
}

/*
 * This is a method to convert arbitrary JSON
 * tracks (with artist and song title) to spotify track objects. Will
 * be replaced when we add libspotify to the backend too. 
 */
function convertJSONTracksToSpotifyTracks(trackInfo, callback) {

  var numTracksToLoad = trackInfo.length;

  tracks = [];

  // For each artist
  trackInfo.forEach(function(track) {

    artist = track.artist;

    // Create a spotify search
    var search = new sp.Search("artist:" + artist);
    search.trackCount = 1; // we're only interested in the first result for now;

    // Execute the search
    search.execute();

    // When the search has been completed
    search.once('ready', function() {

      // If there aren't any searches
      if(!search.tracks.length) {
          console.error('there is no track to play :[');
          return;

      } else {

        // Add the track to the rest of the tracks
        tracks = tracks.concat(search.tracks);
      }

      // Keep track of how far we've come
      numTracksToLoad--;

      // If we've checked all the artists
      if (!numTracksToLoad) {
        // Shuffle up the tracks
        shuffle(tracks);

        // Call our callback
        callback(tracks);
      }
    });
  });

}

/*
 * Given a list of spotify tracks, play them all
 */ 
function beginTrackPlayQueue(tracks) {
  var i = 0;

  // Tim wrote this and I don't really understand his logic
  function navTrack () {
    // When i is less than zero , make it equal to the track length
    if (i < 0) i += tracks.length;
    // When it's above zero, decrement it
    if (i >= tracks.length) i -= tracks.length;

    // Print the name
    console.log('\nPlaying', tracks[i].title + " by " + tracks[i].artist.name);

    // Play the song
    playTrackWhenReady(spotifySession, tracks[i], function (play) {
      // prepare the key codes for changing the song
      function listenNav (ch, key) {
        if (key.code == '[C' || key.code == '[D') {
          if (key.code == '[C') i++;
          if (key.code == '[D') i--;
          process.stdin.removeListener('keypress', listenNav);
          play.kill('SIGHUP');
          navTrack();
        }
      }
      process.stdin.on('keypress', listenNav);
    });
  }
  navTrack();
}

/*
 * Play a track when it is deemed ready by spotify
 */
function playTrackWhenReady (spotifySession, track, next) {

  // If the track is already ready, play it!
  if (track.isReady) playReadyTrack(track, next);

  // If not, then wait until it is
  else track.on('ready', playReadyTrack(track, next));
}

/*
 * Helper function for playing a track when it is
 * definitely already ready. There is probably a better
 * way to do this
 */ 
function playReadyTrack(track, next) {

  // Grab the player
  var player = spotifySession.getPlayer();

  // Load the given track
  player.load(track);

  // Start playing it
  player.play();

  // Start a sox stream
  var play = spawn('play', ['-r', 44100, '-b', 16, '-L', '-c', 2, '-e', 'signed-integer', '-t', 'raw', '-']);
  // Pipe in the spotify stream
  player.pipe(play.stdin);
  // Pipe in any errors
  play.stderr.pipe(process.stderr);

  // Let us know if there is an error
  play.on('exit', function (code) {
    console.error('Exited with code', code);
  });

  // Get ready for key codes
  next(play);

  // Print out the track duration
  console.error('playing track. end in %s', track.humanDuration);
  
  // Let us know when it stopped streaming
  player.once('track-end', function() {
    console.error('Track streaming ended.');
    // spotifySession.getPlayer().stop();
    // spotifySession.close();
  });
}

/*
 * Shuffles list in-place
 */
function shuffle(list) {
  var i, j, t;
  for (i = 1; i < list.length; i++) {
    j = Math.floor(Math.random()*(1+i));  // choose j in [0..i]
    if (j != i) {
      t = list[i];                        // swap list[i] and list[j]
      list[i] = list[j];
      list[j] = t;
    }
  }
}


// Export our public functions
exports.connectSpotify = connectSpotify;
exports.playTracks = beginPlayingTracks;
