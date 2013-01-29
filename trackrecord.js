var rem = require('rem');
var sp = require('libspotify');
var fs = require('fs');
var http = require('http');
var spawn = require('child_process').spawn;
var keypress = require('keypress'); 
var spotifySession;
var streaming = false;

 /*
  * Fetch a user's artists from our backend
  */
function playTracksFromRemote(facebookID) {
  HTTP_GET(/*'http://entranceapp.herokuapp.com'*/'localhost:5000/', facebookID + '/tracks', function(jsonResponse) {
    console.log(jsonResponse);
    convertTracksToSpotifyObjects(jsonResponse.tracks, playTracks)
  })
}

/*
 * This should just be a temporary method to convert arbitrary JSON
 * tracks (with artist and song title) to spotify track objects. Will
 * be replaced when we add libspotify to the backend too. 
 */
function convertTracksToSpotifyObjects(tracks, callback) {

  // For each artist
  tracks.forEach(function(track) {

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
      loadedTracks++;

      // If we've checked all the artists
      if (loadedTracks == artists.length) {
        // Shuffle up the tracks
        shuffle(tracks);

        // Call our callback
        callback(tracks);
      }
    });
  });

}

/*
 * Beings a spotify session
 */
function connectSpotify (callback) {
  // Create a spotify session wth our api key
  spotifySession = new sp.Session({
    applicationKey: process.env.SPOTIFY_KEYPATH
  });
  // Log in with our credentials
  spotifySession.login(process.env.SPOTIFY_USERNAME, process.env.SPOTIFY_PASSWORD);

  var player = spotifySession.getPlayer();

  player.on("play", function() { streaming = true; });

  player.on("stop", function() { streaming = false; });

  // Once we're logged in, continue with the callback
  spotifySession.once('login', function (err) {
    if (err) return console.error('Error:', err);
    callback(spotifySession);
  });
}

// /*
//  * Public function to begin playing the favorite tracks of a user
//  */
// function playFavorites (facebookAPI, facebookID) {

//     getFavoriteTracks(facebookAPI, facebookID, playTracks);
// }

// /*
//  * Poll the appropriate sources to find the favorite artists and songs
//  * of a user, then call a callback
//  */
// function getFavoriteTracks(facebookAPI, facebookID, callback) {

//   // Use the Facebook API to get all the music likes of a user
//   facebookAPI(facebookID + '/music').get(function (err, json) {
//     var tracks = [];
//     var loadedTracks = 0;

//     // Parse the artist names out of the JSON
//     parseArtistNames(json, function(artists) {

//       // If there were no artists, return
//       if (!artists.length) { 
//         console.log("No Artists Returned for facebook ID:" + facebookID);
//         return;
//       }

//       // For each artist
//       artists.forEach(function(artist) {

//         // Create a spotify search
//         var search = new sp.Search("artist:" + artist);
//         search.trackCount = 1; // we're only interested in the first result for now;

//         // Execute the search
//         search.execute();

//         // When the search has been completed
//         search.once('ready', function() {

//           // If there aren't any searches
//           if(!search.tracks.length) {
//               console.error('there is no track to play :[');
//               return;

//           } else {

//             // Add the track to the rest of the tracks
//             tracks = tracks.concat(search.tracks);
//           }

//           // Keep track of how far we've come
//           loadedTracks++;

//           // If we've checked all the artists
//           if (loadedTracks == artists.length) {
//             // Shuffle up the tracks
//             shuffle(tracks);

//             // Call our callback
//             callback(tracks);
//           }
//         });
//       });
//     });
//   });
// }

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

/*
 * Check each json snippet for the artist names
 */
function parseArtistNames(json, callback) {
  var names = [];
  // For each JSON item
  json.data.forEach(function(item) {
    // If we have a name field
    if (item.name) {
      // Push it into the list
      names.push(item.name);
    }
  });
  // Call the callback when we're done
  return callback(names);
}

/*
 * Given a list of spotify tracks, play them all
 */ 
function playTracks(tracks) {
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
    playTrack(spotifySession, tracks[i], function (play) {
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
function playTrack (spotifySession, track, next) {

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

function HTTP_GET(hostname, path, callback) {
  // Configure our get request
  var options = {
    host: hostname,
    path: path
  };

   http.get(options, function(res) {
    var output = '';
    var jsonResult;
    res.on('error', function(e) {
      console.log('HTTP Error!');
      callback(e, null);
    });

    res.on('data', function(chunk) {
      console.log(chunk);
      output+= chunk;
    });

    res.on('end', function() {
      console.log("Server Response: " + output);
      console.log("Status Code: " + res.statusCode);
      callback (JSON.parse(output));
    });
  }); // end of http.get

}

// Export our public functions
exports.connectSpotify = connectSpotify;
exports.playFavorites = playTracksFromRemote;
exports.isStreaming = streaming;