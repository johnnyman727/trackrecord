var rem = require('rem');
var sp = require('libspotify');
var fs = require('fs');
var spawn = require('child_process').spawn;
var keypress = require('keypress'); 
var spotifySession;


function initialize(callback) {
  connectSpotify(function (spotifySession) {
    rem.connect('facebook.com').prompt({
      scope: ['user_actions.music', 'friends_actions.music']
    }, function (err, facebookAPI) {
      // make `process.stdin` begin emitting "keypress" events
      keypress(process.stdin);
      // listen for the "keypress" event
      process.stdin.on('keypress', function (ch, key) {
        if (key && key.ctrl && key.name == 'c') {
          process.exit(1);
        }
      });
      process.stdin.setRawMode(true);
      process.stdin.resume();        

      callback(err, facebookAPI);

    });
  });
}

function connectSpotify (next) {
  spotifySession = new sp.Session({
    applicationKey: process.env.SPOTIFY_KEYPATH
  });
  spotifySession.login(process.env.SPOTIFY_USERNAME, process.env.SPOTIFY_PASSWORD);
  spotifySession.once('login', function (err) {
    if (err) return console.error('Error:', err);
    next(spotifySession);
  });
}

function playFavorites (facebookAPI, facebookID) {

    getFavoriteTracks(facebookAPI, facebookID, playTracks);
}

function getFavoriteTracks(facebookAPI, facebookID, callback) {
  facebookAPI(facebookID + '/music').get(function (err, json) {
    var tracks = [];
    var loadedTracks = 0;
    parseArtistNames(json, function(artists) {
      artists.forEach(function(artist) {
        var search = new sp.Search("artist:" + artist);
        search.trackCount = 1; // we're only interested in the first result;
        search.execute();
        search.once('ready', function() {
          if(!search.tracks.length) {
              console.error('there is no track to play :[');

          } else {
            tracks = tracks.concat(search.tracks);
          }
          loadedTracks++;


          if (loadedTracks == artists.length) {
            shuffle(tracks);
            callback(tracks);
          }
        });
      });
    });
  });
}

//shuffles list in-place
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

function parseArtistNames(json, callback) {
  var names = [];
  json.data.forEach(function(item) {
    if (item.name) {
      names.push(item.name);
    }
  });
  return callback(names);
}

function playTracks(tracks) {
  var i = 0;
  function navTrack () {
    if (i < 0) i += tracks.length;
    if (i >= tracks.length) i -= tracks.length;

    console.log('\nPlaying', tracks[i].title + " by " + tracks[i].artist.name);
    playTrack(spotifySession, tracks[i], function (play) {
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

function playTrack (spotifySession, track, next) {
  if (track.isReady) playReadyTrack(track, next);

  else track.on('ready', playReadyTrack(track, next));
}

function playReadyTrack(track, next) {
  var player = spotifySession.getPlayer();
    player.load(track);
    player.play();

    var play = spawn('play', ['-r', 44100, '-b', 16, '-L', '-c', 2, '-e', 'signed-integer', '-t', 'raw', '-']);
    player.pipe(play.stdin);
    play.stderr.pipe(process.stderr);

    play.on('exit', function (code) {
      console.error('Exited with code', code);
    });

    next(play);

    console.error('playing track. end in %s', track.humanDuration);
    player.once('track-end', function() {
      console.error('Track streaming ended.');
      // spotifySession.getPlayer().stop();
      // spotifySession.close();
    });
}

exports.initialize = initialize;
exports.playFavorites = playFavorites;