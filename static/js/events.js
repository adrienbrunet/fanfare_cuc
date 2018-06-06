$( document ).ready(function() {
  $('.toggle-event').click(function (evt) {
    let target = evt.currentTarget;
    let eventPk = $(target).data("eventPk");
    $('.icon-event-' + eventPk).toggleClass('fa-plus');
    $('.icon-event-' + eventPk).toggleClass('fa-minus');
    $('.know-more-' + eventPk).fadeToggle();
  });
});
