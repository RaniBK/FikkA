(function ($, window, document, undefined) {

  var defaults = {
    autoplay: 4000,
    animationDuration: 800,
    hoverPause: true,
    slide: ">figure",
    slideWrapper: false,
    slides: ">aside",
    thumbs: false,
    thumb: ">figure",
    debug: false,
    showNavigator: true,
    beforeTransition: function(){},
    afterTransition: function(){}
  };


  var Tiny = function(container, options){
      var _ = this;

      this.options = $.extend({}, defaults, options),
      this.container = container,
      this.slideContainer = $(this.options.slides,this.container),
      this.slideWrapper = (this.options.slideWrapper == false) ? false : $(this.options.slideWrapper, this.container),
      this.slides = $(this.options.slide, this.slideContainer),
      this.thumbContainer = (this.options.thumbs == false) ? false : $(this.options.thumbs, this.container);
      this.thumbs = (this.thumbContainer == false || this.thumbContainer.size() == 0) ? false : $(this.options.thumb, this.thumbContainer);
      this.numSlides = this.slides.length,
      this.currentSlideIndex = 0,
      this.autoplayTimer,
      this.debounce,
      this.afterAnimationTimer,
      this.slideWidth,
      this.slideNavigator,
      this.slideNavigatorItems,
      this.$w = $(window),
      this.afterAnimationCallStack = [],
      this.animating = false;

      //mobile
      this.dragThreshold = .10,
      this.dragStart = null,
      this.percentage = 0,
      this.dragStartSlidePosition = 0,
      this.dragTarget,
      this.previousDragTarget,
      this.delta = 0
    ;

    // Test via a getter in the options object to see if the passive property is accessed
    this.supportsPassive = false;
    try {
      var opts = Object.defineProperty({}, 'passive', {
        get: function() {
          _.supportsPassive = true;
        }
      });
      window.addEventListener("test", null, opts);
    } catch (e) {}

    this.api = {
      getSlide: function(index){
        if(_.animating == false){
          _.api.pause();
          _.currentSlideIndex = index;
          _.showSlide();
        }
      },

      getSlideObject: function(offset){
        offset = (typeof(offset) == "undefinied") ? 0 : offset;
        return _.slides.eq(_.currentSlideIndex+offset);
      },

      nextSlide: function(){
        var index = _.currentSlideIndex;
        index++;
        index = (index >= _.numSlides) ? 0 : index;
        _.api.getSlide(index);
      },

      prevSlide: function(){
        var index = _.currentSlideIndex;
        index--;
        index = (index < -1) ? _.numSlides - 1 : index;
        _.currentSlideIndex = index;
        _.api.getSlide(index);
      },

      play: function(){
        //disable autoplay if set to 0
        if( _.options.autoplay == 0 ){
          return;
        }

        _.api.pause();
        _.autoplayTimer = setTimeout(function(){
          _.api.nextSlide();
        }, _.options.autoplay);
      },

      pause: function(){
        if(typeof _.autoplayTimer !== "undefined"){
          clearTimeout(_.autoplayTimer);
        }
      },

      unload: function(){
        _.api.pause();
        _.options.autoplay = 0;
        clearTimeout(_.autoplayTimer);
        clearTimeout(_.debounce);

        if(_.slideNavigator){
          _.slideNavigator.remove();
          _.container.removeClass('has-navigator');
        }

        _.slideContainer.css("width","");
        _.slides.css("width","");
        _.slideContainer.css(_.getPrefix()+'transition','');
        _.slideContainer.css(_.getPrefix()+'transform','');

        _.$w.off('resize',_.resize);

        _.container.get(0).removeEventListener("touchstart", _.touchStart, _.supportsPassive ? { passive: true} : false);
        _.container.get(0).removeEventListener("touchmove", _.touchMove, _.supportsPassive ? { passive: true} : false);
        _.container.get(0).removeEventListener("touchend", _.touchEnd, _.supportsPassive ? { passive: true} : false);

        _.container.off({
          'mouseover': _.api.pause,
          'mouseout': _.api.play,
        });

        _.$w.off({
          'keydown': _.keypress,
        });

        $.removeData(_.container.get(0),'api_tiny');

      }

    }

    this.keypress = function(event){
      var key = event.which;
      switch(key){
        case 39: //right
          _.api.nextSlide();
          break;
        case 37: //left
          _.api.prevSlide();
          break;
      }
    }

    this.touchStart = function(event){

      if (_.dragStart !== null) { return; }

      if (event.touches) {
        event = event.touches[0];
      }

      // where in the viewport was touched
      _.dragStart = {x: event.clientX, y: event.clientY};

      //get slide position at start
      _.dragStartSlidePosition = _.getCurrentSlidePosition();

      // make sure we're dealing with a slide
      _.dragTarget = _.slides.eq(_.currentSlideIndex)[0];

      _.previousDragTarget = _.slides.eq(_.currentSlideIndex-1)[0];

      _.api.pause();
      _.animating = false;
      _.pauseTransition();

    }

    this.touchMove = function(event){

      if (_.dragStart.x === null) { return; }

      if (event.touches) {
        event = event.touches[0];
      }

      _.delta = {x: _.dragStart.x - event.clientX, y: _.dragStart.y - event.clientY};
      _.percentage = _.delta.x / _.$w.width();

      //if we are mostly scrolling up or down, let browser do the work
      if( _.dragStartSlidePosition == _.getCurrentSlidePosition() && Math.abs(_.delta.y) > 2 ){
        return true;
      }

      //otherwise, let's scroll the slider
      if(_.numSlides > 1 && Math.abs(_.percentage) < 1){
        _.translate( _.dragStartSlidePosition - _.delta.x );
      }


      return false;
    }
    this.touchEnd = function(){

      _.dragStart = null;

      if (_.percentage >= _.dragThreshold) {
        _.api.nextSlide();
      }
      else if ( Math.abs(_.percentage) >= _.dragThreshold ) {
        _.api.prevSlide();
      }

      percentage = 0;
    }

    this.debugMsg = function(message){
      if(_.options.debug == true){
        console.log(message);
      }
    }

    this.setupInfinite = function(){
      var first = _.slides.eq(0).clone(true).attr('data-index',_.numSlides).appendTo(_.slideContainer);
      first.addClass('cloned');
      first.attr("data-clonedindex",0);
      var image = $(".responsive-bg",first);
      image.addClass("visible");

      var last = _.slides.eq(_.numSlides-1).clone(true).attr('data-index',-1).prependTo(_.slideContainer);
      last.addClass('cloned');
      last.attr('data-clonedindex',_.numSlides-1);
      image = $(".responsive-bg",last);
      image.addClass("visible");

      _.slides = $(_.options.slide, _.slideContainer);
      _.numSlides = _.slides.length;

    }

    this.getSlideAtIndex = function(index){
      var slide = _.slideContainer.find("[data-index='"+index+"']");
      return slide;
    }

    this.init = function(){

      //make sure that each slide has data-index set
      _.slides.each(function(index){
        var $this = $(this);
        if(typeof($this.attr("data-index")) == "undefined"){
          $this.attr('data-index', index);
        }
      });

      _.drawNavigator();
      _.setupInfinite();
      _.dimensions();
      _.setupThumbnailNavigator();

      if(_.thumbs !== false){
        _.thumbs.eq(0).addClass('active');
      }

      _.currentSlideIndex = 0;
      _.transitionNoAnimation();

      _.container.get(0).addEventListener("touchstart", _.touchStart, _.supportsPassive ? { passive: true} : false);
      _.container.get(0).addEventListener("touchmove", _.touchMove, _.supportsPassive ? { passive: true} : false);
      _.container.get(0).addEventListener("touchend", _.touchEnd, _.supportsPassive ? { passive: true} : false);

      //setup keyboard events
      _.$w.on({
        'keydown': _.keypress,
      });

      _.api.play();

      if(document.addEventListener){
        document.addEventListener("visibilitychange", function(e) {
          if(document.visibilityState == 'hidden') {
            // page is hidden
            _.api.pause();
            _.pauseTransition();

          } else {
            // page is visible
            _.setTransition();
            _.api.play();
          }
        });
      }

      if(_.options.hoverPause == true){
        _.container.on('mouseover',_.api.pause);
        _.container.on('mouseout',_.api.play);
      }

      _.$w.resize(_.resize);

    }

    this.resize = function(){
      _.debounce && clearTimeout(_.debounce);
      _.debounce = setTimeout(function(){
        _.dimensions();
        _.transitionNoAnimation();
        _.updateThumbnails();
      }
      , 20);
    }

    this.setupThumbnailNavigator = function(){
      if( this.thumbContainer == false){
        return;
      }

      _.thumbContainer.on("click",_.options.thumb,function(){
        _.api.getSlide( $(this).data('index') );
      });
    }

    this.drawNavigator = function() {

      if( _.options.showNavigator == false || _.numSlides < 2 ){
        _.options.showNavigator = false;
        return;
      }

      var output = "<div class='navigator'><ul>\n";
      for(var i=0; i < _.numSlides; i++){
        output += "<li data-index='"+i+"'><span>"+i+"</span></li>\n";
      }
      output += "</ul>";

      _.slideNavigator = $(output);
      _.container.append(_.slideNavigator);
      _.container.addClass('has-navigator');

      _.slideNavigatorItems = $("li",_.slideNavigator);
      $(_.slideNavigatorItems.get(0)).addClass("active");

      _.slideNavigator.on("click","li",function(){
        _.api.getSlide( $(this).data('index') );
      });
    }

    this.dimensions = function(){
      _.slideWidth = _.container.width();
      if(_.slideWrapper != false){
        _.slideWidth = _.slideWrapper.width();
      }
      _.slides.width(_.slideWidth);
      _.slideContainer.width( ( _.slideWidth * (_.numSlides)) );
    }

    this.pauseTransition = function(){
      _.slideContainer.css(_.getPrefix()+'transition','none');
    }

    this.setTransition = function(){
      _.slideContainer.css(_.getPrefix()+'transition',_.getPrefix()+'transform '+_.options.animationDuration+'ms cubic-bezier(0.365, 0.84, 0.44, 1)');
    }

    this.getCurrentSlidePosition = function(){
      var matrix = _.slideContainer.css('transform').replace(/[^0-9\-.,]/g, '').split(',');
      return parseInt(matrix[12] || matrix[4]);
    }

    this.translate = function(x){
      _.slideContainer.css(_.getPrefix()+'transform','translate3d('+x+'px,0px,0px)');
    }
    this.getPrefix = function () {

      if (!window.getComputedStyle) return '';

      var styles = window.getComputedStyle(document.documentElement, '');
      return '-' + (Array.prototype.slice
        .call(styles)
        .join('')
        .match(/-(moz|webkit|ms)-/) || (styles.OLink === '' && ['', 'o'])
      )[1] + '-';

    }

    this.updateNavigator = function(){
      if( _.options.showNavigator == false ){
        return false;
      }
      var currentIndex = _.getSlideIndex(_.currentSlideIndex + 1);
      var currentNav = _.slideNavigatorItems.filter("[data-index=\""+currentIndex+"\"]");
      currentNav.addClass('active')
        .siblings().removeClass('active');
      return true;
    }

    this.updateThumbnails = function(){

      if(_.thumbs === false){
        return;
      }

      var currentIndex = _.getSlideIndex(_.currentSlideIndex + 1);
      var currentThumb = _.thumbs.filter("[data-index=\""+currentIndex+"\"]");

      var scrollLeft = _.thumbContainer.scrollLeft();
      var scrollWidth = _.thumbContainer.width();

      var left = currentThumb.position().left;
      var width = currentThumb.outerWidth(true);

      currentThumb.addClass('active')
        .siblings().removeClass('active');

      if((scrollLeft+scrollWidth) < (left+width)){
        _.animateThumbnailScroll(left+width);
      }

      if( (left) < (0) ){
        _.animateThumbnailScroll( scrollLeft - scrollWidth );
      }

    }

    this.animateThumbnailScroll = function(left){
       _.thumbContainer.animate({scrollLeft: left}, 300);
      return true;
    }

    this.getSlideIndex = function(currentSlideIndex){
      var slide = _.slides.eq(currentSlideIndex);
      //get it's index
      var index = slide.data("index");
      //update the index to equal that of it's clonedIndex if there is one.
      index = (typeof(slide.attr("data-clonedindex")) != "undefined") ? slide.data("clonedindex") : index;
      return index;
    }

    this.getCurrentSlideIndex = function(){
      return _.getSlideIndex(_.currentSlideIndex);
    }

    this.setActiveSlide = function(){
      //get the active slide
      var active = _.slides.eq(_.currentSlideIndex + 1);
      var index = _.getSlideIndex(_.currentSlideIndex + 1);

      //get all the slides that have the same index
      var clonedSiblings = _.slides.filter("[data-clonedindex=\""+index+"\"]").add(_.slides.filter("[data-index=\""+index+"\"]"));

      if(!clonedSiblings.hasClass('active')){
        //add active to cloned siblings
        clonedSiblings.addClass('active');
      }

      //remove active class on everything else
      active.siblings().not(clonedSiblings).removeClass('active');
    }

    this.transitionNoAnimation = function(){
      _.pauseTransition();
      _.translate( -1 * ( _.currentSlideIndex+1 ) * _.slideWidth );
      _.setActiveSlide();
    }

    this.showSlide = function(){

      //finish any animations that may still be out there
      _.afterAnimationHandler();

      _.animating = true;
      _.api.pause();
      _.setTransition();

      _.options.beforeTransition.call(this);

      _.translate( -1 * ( _.currentSlideIndex+1 ) * _.slideWidth );

      _.updateNavigator();
      _.setActiveSlide();
      _.updateThumbnails();

      _.afterAnimation(function(){

        //handle Infinite
        if(_.currentSlideIndex == -1){
          _.currentSlideIndex = _.numSlides - 3;
          _.transitionNoAnimation();
        } else if(( _.currentSlideIndex+2 ) == _.numSlides){
          _.currentSlideIndex = 0;
          _.transitionNoAnimation();
        }

        _.options.afterTransition.call(this);

        _.animating = false;

      });

      _.api.play();
    }

    this.afterAnimationHandler = function(){

      clearTimeout(_.afterAnimationTimer);

      for(var i = 0; i < _.afterAnimationCallStack.length; i++){
        new _.afterAnimationCallStack[i]();
      }

      //clear the call stack
      _.afterAnimationCallStack = [];
    }

    this.afterAnimation = function(callback){
      if(typeof(callback) != "function"){
        return;
      }
      _.afterAnimationCallStack.push(callback);

      _.afterAnimationTimer = setTimeout(_.afterAnimationHandler, _.options.animationDuration);
    }

    this.init();

    return this.api;
  }

  $.fn["tiny"] = function(options) {
    return this.each(function () {
      if ( !$.data(this, 'api_tiny') ) {
        $.data(this, 'api_tiny',
         new Tiny($(this), options)
        );
      }
    });
  };

})(jQuery, window, document);
