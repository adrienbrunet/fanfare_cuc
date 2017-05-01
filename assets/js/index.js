var $ = require("jquery");

var playTrack = function (filename, pk) {
  // Load a MIDI file
  MIDIjs.stop();
  MIDIjs.play(filename);
  $("#play-" + pk).hide();
  $("pause-" + pk).show();
}

var pauseTrack = function (pk) {
  MIDIjs.stop();
  $("pause-" + pk).hide();
  $("play-" + pk).show();
}

export default {
    playTrack: playTrack,
    pauseTrack: pauseTrack
};