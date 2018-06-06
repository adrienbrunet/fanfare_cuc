/**
 * All following scripts require jquery
 */
$( document ).ready(function () {
  /**
   * Scratchpad with poo
   * Require js libs: konami & wScratchPad
   */
  $('#demo1').wScratchPad({
    bg: static_url + 'images/transparent.png',
    fg: static_url + 'images/caca.png',
    cursor: 'url("' + static_url + 'images/coin.png") 20 20, default',
    size: 50,
    scratchMove: function (e, percent) {
      if (percent > 20) {
        $('.scratchpad').wScratchPad('reset');
        $('#scratch').hide();
      }
    }
  });
  $('#scratch').hide();
  $( window ).konami({
    cheat: function () {
      $('#scratch').show();
      $('.scratchpad').wScratchPad('reset');
    }
  });
  /**
   * Animate logo on startup
   * Require animate.css
   */
  setTimeout(function () {
    $('#logo_img').addClass('animated tada');
  }, 3500);
  /**
   * Type animation on front banner
   * Require javascript lib: typed
   */
  $(function () {
    $(".intro").typed({
      strings: ["LA fanfare de Paris. ", "Le CUC ! &#x2665;&#x2665;"],
      typeSpeed: 0
    });
  });
});
