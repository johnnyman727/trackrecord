var rem = require('rem');
var sp = require('libspotify');
var fs = require('fs');
var spawn = require('child_process').spawn;
var keypress = require('keypress');

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

connectSpotify(function (session) {
  rem.connect('facebook.com').prompt({
    scope: ['user_actions.music', 'friends_actions.music']
  }, function (err, user) {
    user('tmac721/music.listens').get(function (err, json) {
      var songs = [];
      json.data.forEach(function (item) {
        if (item.application && item.application.namespace == 'get-spotify') {
          songs.push({
            title: item.data.song.title,
            uri: item.data.song.url.replace('http://open.spotify.com/track/', 'spotify:track:')
          });
        }
      })

      var i = 0;
      function navTrack () {
        if (i < 0) i += songs.length;
        if (i >= songs.length) i -= songs.length;

        console.log('\nPlaying', songs[i].title)
        playTrack(session, songs[i].uri, function (play) {
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
    })
  });
});

function connectSpotify (next) {
  var session = new sp.Session({
    applicationKey: process.env.SPOTIFY_KEYPATH
  });
  session.login(process.env.SPOTIFY_USERNAME, process.env.SPOTIFY_PASSWORD);
  session.once('login', function (err) {
    if (err) return console.error('Error:', err);
    next(session);
  });
}

function playTrack (session, uri, next) {
  var track = sp.Track.getFromUrl(uri);
  track.on('ready', function() {
    var player = session.getPlayer();
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
      //session.getPlayer().stop();
      //session.close();
    });
  });
}