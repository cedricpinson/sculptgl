'use strict';

( function() {
  var vendors = [ 'moz', 'webkit' ];
  for ( var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x ) {
    window.requestAnimationFrame = window[ vendors[ x ] + 'RequestAnimationFrame' ];
  }
  if ( !window.requestAnimationFrame )
    alert( 'browser is too old. Probably no webgl there anyway' );
}() );

function SculptGL() {
  this.gl_ = null; //webgl context

  //controllers stuffs
  this.lastMouseX_ = 0; //the last position of the mouse in x
  this.lastMouseY_ = 0; //the last position of the mouse in y
  this.sumDisplacement_ = 0; //sum of the displacement mouse
  this.mouseButton_ = 0; //which mouse button is pressed
  this.cameraTimer_ = -1; //interval id (used for zqsd/wasd/arrow moves)
  this.usePenRadius_ = true; //the pen pressure acts on the tool's radius
  this.usePenIntensity_ = false; //the pen pressure acts on the tool's intensity

  //symmetry stuffs
  this.symmetry_ = false; //if symmetric sculpting is enabled
  this.continuous_ = false; //continuous sculpting
  this.sculptTimer_ = -1; //continuous interval timer
  this.pressureRadius_ = 0; //for continuous sculpting
  this.pressureIntensity_ = 0; //for continuous sculpting
  this.mouseX_ = 0; //for continuous sculpting
  this.mouseY_ = 0; //for continuous sculpting
  this.ptPlane_ = [ 0.0, 0.0, 0.0 ]; //point origin of the plane symmetry
  this.nPlane_ = [ 1.0, 0.0, 0.0 ]; //normal of plane symmetry

  //core of the app
  this.states_ = new States(); //for undo-redo
  this.camera_ = new Camera(); //the camera
  this.picking_ = new Picking( this.camera_ ); //the ray picking
  this.pickingSym_ = new Picking( this.camera_ ); //the symmetrical picking
  this.sculpt_ = new Sculpt( this.states_ ); //sculpting management
  this.background_ = null; //the background
  this.mesh_ = null; //the mesh

  //datas
  this.textures_ = {}; //textures
  this.shaders_ = {}; //shaders
  this.sphere_ = ''; //sphere

  //ui stuffs
  this.gui_ = new Gui( this ); //gui
  this.focusGui_ = false; //gui

  //functions
  this.resetSphere_ = this.resetSphere; //load sphere  
  this.undo_ = this.onUndo; //undo last action
  this.redo_ = this.onRedo; //redo last action
  this.cut_ = this.cut; //apply cut tool

  //render
  this.queued_ = false; //render stuff
}

SculptGL.elementIndexType = 0; //element index type (ushort or uint)
SculptGL.indexArrayType = Uint16Array; //typed array for index element (uint16Array or uint32Array)

SculptGL.prototype = {
  /** Initialization */
  start: function() {
    this.initWebGL();
    this.loadShaders();
    this.gui_.initGui();
    this.onWindowResize();
    this.loadTextures();
    this.initEvents();
  },

  /** Initialize */
  initEvents: function() {
    var self = this;
    var $canvas = $( '#canvas' );
    $( '#fileopen' ).change( function( event ) {
      self.loadFile( event );
    } );
    $( '#backgroundopen' ).change( function( event ) {
      self.loadBackground( event );
    } );
    // mouse
    $canvas.mousedown( function( event ) {
      self.onMouseDown( event );
    } );
    $canvas.mouseup( function( event ) {
      self.onMouseUp( event );
    } );
    $canvas.mousewheel( function( event ) {
      self.onMouseWheel( event );
    } );
    $canvas.mousemove( function( event ) {
      self.onMouseMove( event );
    } );
    $canvas.mouseout( function( event ) {
      self.onMouseOut( event );
    } );

    // multi touch
    $canvas.bind( 'touchstart', function( event ) {
      self.onTouchStart( event );
    } );
    $canvas.bind( 'touchend', function( event ) {
      self.onTouchEnd( event );
    } );
    $canvas.bind( 'touchmove', function( event ) {
      self.onTouchMove( event );
    } );
    $canvas.bind( 'touchleave', function( event ) {
      self.onMouseOut( event );
    } );
    $canvas.bind( 'touchcancel', function( event ) {
      self.onMouseOut( event );
    } );

    $canvas[ 0 ].addEventListener( 'webglcontextlost', self.onContextLost, false );
    $canvas[ 0 ].addEventListener( 'webglcontextrestored', self.onContextRestored, false );
    $( window ).keydown( function( event ) {
      self.onKeyDown( event );
    } );
    $( window ).keyup( function( event ) {
      self.onKeyUp( event );
    } );
    $( window ).resize( function( event ) {
      self.onWindowResize( event );
    } );
    // prevent touch scroll
    $( window.body ).bind( 'touchmove', function( event ) {
      event.preventDefault();
    } );
  },

  /** Load webgl context */
  initWebGL: function() {
    var attributes = {
      antialias: false,
      stencil: true,
      preserveDrawingBuffer: true
    };
    try {
      this.gl_ = $( '#canvas' )[ 0 ].getContext( 'webgl', attributes ) || $( '#canvas' )[ 0 ].getContext( 'experimental-webgl', attributes );
    } catch ( e ) {
      alert( 'Could not initialise WebGL.' );
    }
    var gl = this.gl_;
    if ( gl ) {
      if ( gl.getExtension( 'OES_element_index_uint' ) ) {
        SculptGL.elementIndexType = gl.UNSIGNED_INT;
        SculptGL.indexArrayType = Uint32Array;
      } else {
        SculptGL.elementIndexType = gl.UNSIGNED_SHORT;
        SculptGL.indexArrayType = Uint16Array;
      }
      gl.viewportWidth = $( window ).width();
      gl.viewportHeight = $( window ).height();
      gl.clearColor( 0.2, 0.2, 0.2, 1 );
      gl.enable( gl.DEPTH_TEST );
      gl.depthFunc( gl.LEQUAL );
      gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );
      gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );
    }
  },

  /** Load textures (preload) */
  loadTextures: function() {
    var self = this;
    var loadTex = function( path, mode ) {
      var mat = new Image();
      mat.src = path;
      var gl = self.gl_;
      mat.onload = function() {
        var idTex = gl.createTexture();
        gl.bindTexture( gl.TEXTURE_2D, idTex );
        gl.texImage2D( gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mat );
        gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR );
        gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST );
        gl.generateMipmap( gl.TEXTURE_2D );
        gl.bindTexture( gl.TEXTURE_2D, null );
        self.textures_[ mode ] = idTex;
        if ( mode === Shader.mode.MATERIAL + 2 )
          self.loadSphere();
      };
    };
    loadTex( 'ressources/clay.jpg', Shader.mode.MATERIAL );
    loadTex( 'ressources/chavant.jpg', Shader.mode.MATERIAL + 1 );
    loadTex( 'ressources/skin.jpg', Shader.mode.MATERIAL + 2 );
    loadTex( 'ressources/drink.jpg', Shader.mode.MATERIAL + 3 );
    loadTex( 'ressources/redvelvet.jpg', Shader.mode.MATERIAL + 4 );
    loadTex( 'ressources/orange.jpg', Shader.mode.MATERIAL + 5 );
    loadTex( 'ressources/bronze.jpg', Shader.mode.MATERIAL + 6 );
  },

  /** Load shaders as a string */
  loadShaders: function() {
    var xhrShader = function( path ) {
      var shaderXhr = new XMLHttpRequest();
      shaderXhr.open( 'GET', path, false );
      shaderXhr.send( null );
      return shaderXhr.responseText;
    };
    var shaders = this.shaders_;
    shaders.phongVertex = xhrShader( 'shaders/phong.vert' );
    shaders.phongFragment = xhrShader( 'shaders/phong.frag' );
    shaders.transparencyVertex = xhrShader( 'shaders/transparency.vert' );
    shaders.transparencyFragment = xhrShader( 'shaders/transparency.frag' );
    shaders.wireframeVertex = xhrShader( 'shaders/wireframe.vert' );
    shaders.wireframeFragment = xhrShader( 'shaders/wireframe.frag' );
    shaders.normalVertex = xhrShader( 'shaders/normal.vert' );
    shaders.normalFragment = xhrShader( 'shaders/normal.frag' );
    shaders.reflectionVertex = xhrShader( 'shaders/reflection.vert' );
    shaders.reflectionFragment = xhrShader( 'shaders/reflection.frag' );
    shaders.backgroundVertex = xhrShader( 'shaders/background.vert' );
    shaders.backgroundFragment = xhrShader( 'shaders/background.frag' );
  },

  /** Load the sphere */
  loadSphere: function() {
    var sphereXhr = new XMLHttpRequest();
    sphereXhr.open( 'GET', 'ressources/sphere.obj', true );
    var self = this;
    sphereXhr.onload = function() {
      self.sphere_ = this.responseText;
      self.resetSphere();
    };
    sphereXhr.send( null );
  },

  /** render (3d and Dom) when possible rather than on each event*/
  animate: function() {
    var gl = this.gl_;
    gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );
    this.camera_.updateView();
    if ( this.background_ ) {
      gl.depthMask( false );
      this.background_.render();
      gl.depthMask( true );
    }
    if ( this.mesh_ ) {
      this.mesh_.doUpdateBuffers();
      this.mesh_.render( this.camera_, this.picking_, this.sculpt_.lineOrigin_, this.sculpt_.lineNormal_ );
    }
    // this.queued = false;
  },

  /** Request a render */
  render: function() {
    // if (this.queued_ === true)
    //   return;
    this.queued_ = true;
    window.requestAnimationFrame( this.animate.bind( this ) );
  },

  /** Called when the window is resized */
  onWindowResize: function() {
    var newWidth = $( window ).width(),
      newHeight = $( window ).height();
    this.camera_.width_ = newWidth;
    this.camera_.height_ = newHeight;
    $( '#canvas' ).attr( 'width', newWidth );
    $( '#canvas' ).attr( 'height', newHeight );
    var gl = this.gl_;
    gl.viewportWidth = newWidth;
    gl.viewportHeight = newHeight;
    gl.viewport( 0, 0, newWidth, newHeight );
    this.camera_.updateProjection();
    this.render();
  },

  /** Key pressed event */
  onKeyDown: function( event ) {
    event.stopPropagation();
    if ( !this.focusGui_ )
      event.preventDefault();
    var key = event.which;
    if ( event.ctrlKey && key === 90 ) //z key
    {
      this.onUndo();
      return;
    } else if ( event.ctrlKey && key === 89 ) //y key
    {
      this.onRedo();
      return;
    }
    if ( event.altKey ) {
      if ( this.camera_.usePivot_ )
        this.picking_.intersectionMouseMesh( this.mesh_, this.lastMouseX_, this.lastMouseY_, 0.5 );
      this.camera_.start( this.lastMouseX_, this.lastMouseY_, this.picking_ );
    }
    switch ( key ) {
      case 48: // 0
      case 96: // NUMPAD 0
        this.gui_.ctrlSculpt_.setValue( Sculpt.tool.SCALE );
        break;
      case 49: // 1
      case 97: // NUMPAD 1
        this.gui_.ctrlSculpt_.setValue( Sculpt.tool.BRUSH );
        break;
      case 50: // 2
      case 98: // NUMPAD 2
        this.gui_.ctrlSculpt_.setValue( Sculpt.tool.INFLATE );
        break;
      case 51: // 3
      case 99: // NUMPAD 3
        this.gui_.ctrlSculpt_.setValue( Sculpt.tool.ROTATE );
        break;
      case 52: // 4
      case 100: // NUMPAD 4
        this.gui_.ctrlSculpt_.setValue( Sculpt.tool.SMOOTH );
        break;
      case 53: // 5
      case 101: // NUMPAD 5
        this.gui_.ctrlSculpt_.setValue( Sculpt.tool.FLATTEN );
        break;
      case 54: // 6
      case 102: // NUMPAD 6
        this.gui_.ctrlSculpt_.setValue( Sculpt.tool.PINCH );
        break;
      case 55: // 7
      case 103: // NUMPAD 7
        this.gui_.ctrlSculpt_.setValue( Sculpt.tool.CREASE );
        break;
      case 56: // 8
      case 104: // NUMPAD 8
        this.gui_.ctrlSculpt_.setValue( Sculpt.tool.DRAG );
        break;
      case 57: // 9
      case 105: // NUMPAD 9
        this.gui_.ctrlSculpt_.setValue( Sculpt.tool.COLOR );
        break;
      case 78: // N
        this.gui_.ctrlNegative_.setValue( !this.sculpt_.negative_ );
        break;
      case 37: // LEFT
      case 81: // Q
      case 65: // A
        this.camera_.moveX_ = -1;
        break;
      case 39: // RIGHT
      case 68: // D
        this.camera_.moveX_ = 1;
        break;
      case 38: // UP
      case 90: // Z
      case 87: // W
        this.camera_.moveZ_ = -1;
        break;
      case 40: // DOWN
      case 83: // S
        this.camera_.moveZ_ = 1;
        break;
    }
    var self = this;
    if ( this.cameraTimer_ === -1 ) {
      this.cameraTimer_ = setInterval( function() {
        self.camera_.updateTranslation();
        self.render();
      }, 20 );
    }
  },

  /** Key released event */
  onKeyUp: function( event ) {
    event.stopPropagation();
    event.preventDefault();
    var key = event.which;
    switch ( key ) {
      case 37: // LEFT
      case 81: // Q
      case 65: // A
      case 39: // RIGHT
      case 68: // D
        this.camera_.moveX_ = 0;
        break;
      case 38: // UP
      case 90: // Z
      case 87: // W
      case 40: // DOWN
      case 83: // S
        this.camera_.moveZ_ = 0;
        break;
      case 70: //F
        this.camera_.resetViewFront();
        this.render();
        break;
      case 84: //T
        this.camera_.resetViewTop();
        this.render();
        break;
      case 76: //L
        this.camera_.resetViewLeft();
        this.render();
        break;
    }
    if ( this.cameraTimer_ !== -1 && this.camera_.moveX_ === 0 && this.camera_.moveZ_ === 0 ) {
      clearInterval( this.cameraTimer_ );
      this.cameraTimer_ = -1;
    }
  },

  /** Mouse pressed event */
  onMouseDown: function( event ) {
    event.stopPropagation();
    event.preventDefault();
    var mouseX = event.pageX,
      mouseY = event.pageY;
    this.mouseButton_ = event.which;
    var button = event.which;
    var pressure = Tablet.pressure();
    var pressureRadius = this.usePenRadius_ ? pressure : 1.0;
    var pressureIntensity = this.usePenIntensity_ ? pressure : 1.0;
    if ( button === 1 && !event.altKey ) {
      if ( this.mesh_ ) {
        this.sumDisplacement_ = 0;
        this.states_.start();
        if ( this.sculpt_.tool_ === Sculpt.tool.CUT )
          this.sculpt_.setLineOrigin( mouseX, this.camera_.height_ - mouseY );
        else if ( this.sculpt_.tool_ === Sculpt.tool.ROTATE )
          this.sculpt_.startRotate( this.picking_, mouseX, mouseY, this.pickingSym_, this.ptPlane_, this.nPlane_, this.symmetry_ );
        else if ( this.sculpt_.tool_ === Sculpt.tool.SCALE )
          this.sculpt_.startScale( this.picking_, mouseX, mouseY, this.pickingSym_, this.ptPlane_, this.nPlane_, this.symmetry_ );
        else if ( this.continuous_ && this.sculpt_.tool_ !== Sculpt.tool.DRAG ) {
          this.pressureRadius_ = pressureRadius;
          this.pressureIntensity_ = pressureIntensity;
          this.mouseX_ = mouseX;
          this.mouseY_ = mouseY;
          var self = this;
          this.sculptTimer_ = setInterval( function() {
            self.sculpt_.sculptStroke( self.mouseX_, self.mouseY_, self.pressureRadius_, self.pressureIntensity_, self );
            self.gui_.updateMeshInfo();
            self.render();
          }, 20 );
        } else
          this.sculpt_.sculptStroke( mouseX, mouseY, pressureRadius, pressureIntensity, this );
      }
    } else if ( button === 3 ) {
      if ( this.camera_.usePivot_ )
        this.picking_.intersectionMouseMesh( this.mesh_, mouseX, mouseY, pressureRadius );
      this.camera_.start( mouseX, mouseY, this.picking_ );
    }
  },

  /** Mouse released event */
  onMouseUp: function( event ) {
    event.stopPropagation();
    event.preventDefault();
    if ( this.mesh_ )
      this.mesh_.checkLeavesUpdate();
    if ( this.sculptTimer_ !== -1 ) {
      clearInterval( this.sculptTimer_ );
      this.sculptTimer_ = -1;
    }
    this.gui_.updateMeshInfo();
    this.mouseButton_ = 0;
  },

  /** Mouse out event */
  onMouseOut: function() {
    if ( this.mesh_ )
      this.mesh_.checkLeavesUpdate();
    if ( this.sculptTimer_ !== -1 ) {
      clearInterval( this.sculptTimer_ );
      this.sculptTimer_ = -1;
    }
    this.mouseButton_ = 0;
  },

  /** Mouse wheel event */
  onMouseWheel: function( event ) {
    event.stopPropagation();
    event.preventDefault();
    var dy = event.deltaY;
    dy = dy > 1.0 ? 1.0 : dy < -1.0 ? -1.0 : dy;
    this.camera_.zoom( dy * 0.02 );
    this.render();
  },

  /** Mouse move event */
  onMouseMove: function( event ) {
    event.stopPropagation();
    event.preventDefault();
    var mouseX = event.pageX,
      mouseY = event.pageY;
    var button = this.mouseButton_;
    var tool = this.sculpt_.tool_;
    var st = Sculpt.tool;
    var pressure = Tablet.pressure();
    var pressureRadius = this.usePenRadius_ ? pressure : 1.0;
    var pressureIntensity = this.usePenIntensity_ ? pressure : 1.0;
    var modifierPressed = event.altKey || event.ctrlKey || event.shiftKey;
    if ( this.continuous_ && this.sculptTimer_ !== -1 && !modifierPressed ) {
      this.pressureRadius_ = pressureRadius;
      this.pressureIntensity_ = pressureIntensity;
      this.mouseX_ = mouseX;
      this.mouseY_ = mouseY;
      return;
    }
    if ( tool !== st.CUT && this.mesh_ && ( button !== 1 || ( tool !== st.ROTATE && tool !== st.DRAG && tool !== st.SCALE ) ) )
      this.picking_.intersectionMouseMesh( this.mesh_, mouseX, mouseY, pressureRadius );
    if ( button === 1 && !event.altKey ) {
      if ( tool === st.CUT )
        this.sculpt_.updateLineNormal( mouseX, this.camera_.height_ - mouseY );
      else {
        this.sculpt_.sculptStroke( mouseX, mouseY, pressureRadius, pressureIntensity, this );
        this.gui_.updateMeshInfo();
      }
    } else if ( button === 3 || ( event.altKey && !event.shiftKey && !event.ctrlKey ) )
      this.camera_.rotate( mouseX, mouseY );
    else if ( button === 2 || ( event.altKey && event.shiftKey ) )
      this.camera_.translate( ( mouseX - this.lastMouseX_ ) / 3000.0, ( mouseY - this.lastMouseY_ ) / 3000.0 );
    else if ( event.altKey && event.ctrlKey )
      this.camera_.zoom( ( mouseY - this.lastMouseY_ ) / 3000.0 );
    this.lastMouseX_ = mouseX;
    this.lastMouseY_ = mouseY;
    this.render();
  },

  /** touch start event */
  onTouchStart: function( event ) {
    var touches = event.originalEvent.targetTouches;
    /*for (var i = 0; i < touches; i) {
        var touch = touches[i];
        console.log('touched '  touch.identifier);
    }*/

    event.stopPropagation();
    event.preventDefault();
    var mouseX = touches[ 0 ].pageX,
      mouseY = touches[ 0 ].pageY;
    this.mouseButton_ = touches.length;
    var pressure = Tablet.pressure();
    var pressureRadius = this.usePenRadius_ ? pressure : 1.0;
    var pressureIntensity = this.usePenIntensity_ ? pressure : 1.0;
    var button = touches.length;
    if ( button === 1 ) {
      if ( this.mesh_ ) {
        this.sumDisplacement_ = 0;
        this.states_.start();
        if ( this.sculpt_.tool_ === Sculpt.tool.CUT )
          this.sculpt_.setLineOrigin( mouseX, this.camera_.height_ - mouseY );
        else if ( this.sculpt_.tool_ === Sculpt.tool.ROTATE )
          this.sculpt_.startRotate( this.picking_, mouseX, mouseY, this.pickingSym_, this.ptPlane_, this.nPlane_, this.symmetry_ );
        else if ( this.sculpt_.tool_ === Sculpt.tool.SCALE )
          this.sculpt_.startScale( this.picking_, mouseX, mouseY, this.pickingSym_, this.ptPlane_, this.nPlane_, this.symmetry_ );
        else if ( this.continuous_ && this.sculpt_.tool_ !== Sculpt.tool.DRAG ) {
          this.pressureRadius_ = pressureRadius;
          this.pressureIntensity_ = pressureIntensity;
          this.mouseX_ = mouseX;
          this.mouseY_ = mouseY;
          var self = this;
          this.sculptTimer_ = setInterval( function() {
            self.sculpt_.sculptStroke( self.mouseX_, self.mouseY_, self.pressureRadius_, self.pressureIntensity_, self );
            self.gui_.updateMeshInfo();
            self.render();
          }, 20 );
        } else
          this.sculpt_.sculptStroke( mouseX, mouseY, pressureRadius, pressureIntensity, this );
      }
    } else if ( button === 3 ) {
      if ( this.camera_.usePivot_ )
        this.picking_.intersectionMouseMesh( this.mesh_, mouseX, mouseY, pressureRadius );
      this.camera_.start( mouseX, mouseY, this.picking_ );
    }
  },

  /** touch end event */
  onTouchEnd: function( event ) {
    event.stopPropagation();
    event.preventDefault();
    if ( this.mesh_ )
      this.mesh_.checkLeavesUpdate();
    if ( this.sculptTimer_ !== -1 ) {
      clearInterval( this.sculptTimer_ );
      this.sculptTimer_ = -1;
    }
    this.gui_.updateMeshInfo();
    this.mouseButton_ = 0;
  },

  /** touch move event */
  onTouchMove: function( event ) {
    var touches = event.originalEvent.targetTouches;
    /*for (var i = 0; i < touches; i) {
        var touch = touches[i];
        console.log('touched '  touch.identifier);
    }*/

    event.stopPropagation();
    event.preventDefault();
    var mouseX = touches[ 0 ].pageX,
      mouseY = touches[ 0 ].pageY;
    var button = this.mouseButton_;
    var tool = this.sculpt_.tool_;
    var st = Sculpt.tool;
    var pressure = Tablet.pressure();
    var pressureRadius = this.usePenRadius_ ? pressure : 1.0;
    var pressureIntensity = this.usePenIntensity_ ? pressure : 1.0;
    var modifierPressed = event.altKey || event.ctrlKey || event.shiftKey;
    if ( this.continuous_ && this.sculptTimer_ !== -1 && !modifierPressed ) {
      this.pressureRadius_ = pressureRadius;
      this.pressureIntensity_ = pressureIntensity;
      this.mouseX_ = mouseX;
      this.mouseY_ = mouseY;
      return;
    }
    if ( tool !== st.CUT && this.mesh_ && ( button !== 1 || ( tool !== st.ROTATE && tool !== st.DRAG && tool !== st.SCALE ) ) )
      this.picking_.intersectionMouseMesh( this.mesh_, mouseX, mouseY, pressureRadius );
    if ( button === 1 && !event.altKey ) {
      if ( tool === st.CUT )
        this.sculpt_.updateLineNormal( mouseX, this.camera_.height_ - mouseY );
      else {
        this.sculpt_.sculptStroke( mouseX, mouseY, pressureRadius, pressureIntensity, this );
        this.gui_.updateMeshInfo();
      }
    } else if ( button === 3 || ( event.altKey && !event.shiftKey && !event.ctrlKey ) )
      this.camera_.rotate( mouseX, mouseY );
    else if ( button === 2 || ( event.altKey && event.shiftKey ) )
      this.camera_.translate( ( mouseX - this.lastMouseX_ ) / 3000.0, ( mouseY - this.lastMouseY_ ) / 3000.0 );
    else if ( event.altKey && event.ctrlKey )
      this.camera_.zoom( ( mouseY - this.lastMouseY_ ) / 3000.0 );
    this.lastMouseX_ = mouseX;
    this.lastMouseY_ = mouseY;
    this.render();
  },

  /** WebGL context is lost */
  onContextLost: function() {
    alert( 'shit happens : context lost' );
  },

  /** WebGL context is restored */
  onContextRestored: function() {
    alert( 'context is restored' );
  },

  /** Load file */
  loadFile: function( event ) {
    event.stopPropagation();
    event.preventDefault();
    if ( event.target.files.length === 0 )
      return;
    var file = event.target.files[ 0 ];
    var name = file.name.toLowerCase();
    var fileType = '';
    fileType = name.endsWith( '.obj' ) ? 'obj' : fileType;
    fileType = name.endsWith( '.stl' ) ? 'stl' : fileType;
    fileType = name.endsWith( '.ply' ) ? 'ply' : fileType;
    if ( fileType === '' )
      return;
    var reader = new FileReader();
    var self = this;
    reader.onload = function( evt ) {
      self.startMeshLoad();
      if ( fileType === 'obj' )
        Import.importOBJ( evt.target.result, self.mesh_ );
      else if ( fileType === 'stl' )
        Import.importSTL( evt.target.result, self.mesh_ );
      else if ( fileType === 'ply' )
        Import.importPLY( evt.target.result, self.mesh_ );
      self.endMeshLoad();
      $( '#fileopen' ).replaceWith( $( '#fileopen' ).clone( true ) );
    };
    if ( fileType === 'obj' )
      reader.readAsText( file );
    else if ( fileType === 'stl' )
      reader.readAsBinaryString( file );
    else if ( fileType === 'ply' )
      reader.readAsBinaryString( file );
  },

  /** Load background */
  loadBackground: function( event ) {
    if ( event.target.files.length === 0 )
      return;
    var file = event.target.files[ 0 ];
    if ( !file.type.match( 'image.*' ) )
      return;
    if ( !this.background_ ) {
      this.background_ = new Background( this.gl_ );
      this.background_.init( this.shaders_ );
    }
    var reader = new FileReader();
    var self = this;
    reader.onload = function( evt ) {
      var bg = new Image();
      bg.src = evt.target.result;
      self.background_.loadBackgroundTexture( bg );
      self.render();
      $( '#backgroundopen' ).replaceWith( $( '#backgroundopen' ).clone( true ) );
    };
    reader.readAsDataURL( file );
  },

  /** Open file */
  resetSphere: function() {
    this.startMeshLoad();
    Import.importOBJ( this.sphere_, this.mesh_ );
    this.endMeshLoad();
  },

  /** Apply cut tool */
  cut: function() {
    this.sculpt_.cut( this.picking_ );
    this.gui_.updateMeshInfo();
    this.render();
  },

  /** Initialization before loading the mesh */
  startMeshLoad: function() {
    this.mesh_ = new Mesh( this.gl_ );
    this.states_.reset();
    this.states_.mesh_ = this.mesh_;
    this.sculpt_.mesh_ = this.mesh_;
    //reset flags (not necessary...)
    Mesh.stateMask_ = 1;
    Vertex.tagMask_ = 1;
    Vertex.sculptMask_ = 1;
    Triangle.tagMask_ = 1;
  },

  /** The loading is finished, set stuffs ... and update camera */
  endMeshLoad: function() {
    var mesh = this.mesh_;
    mesh.initMesh();
    mesh.moveTo( [ 0.0, 0.0, 0.0 ] );
    this.camera_.reset();
    this.gui_.updateMesh( mesh );
    mesh.initRender( mesh.render_.shader_.type_, this.textures_, this.shaders_ );
    this.render();
  },

  /** Update information on mesh */
  updateGuiMesh: function() {
    if ( !this.mesh_ )
      return;
    var mesh = this.mesh_;
    this.ctrlColor_.object = mesh.render_;
    this.ctrlColor_.updateDisplay();
    // this.ctrlShaders_.object = mesh.render_;
    // this.ctrlShaders_.updateDisplay();
    this.ctrlNbVertices_.name( 'Vertices : ' + mesh.vertices_.length );
    this.ctrlNbTriangles_.name( 'Triangles : ' + mesh.triangles_.length );
  },

  /** Open file */
  openFile: function() {
    $( '#fileopen' ).trigger( 'click' );
  },

  /** Save file */
  saveFile: function() {
    if ( !this.mesh_ )
      return;
    var data = [ Files.exportOBJ( this.mesh_ ) ];
    var blob = new Blob( data, {
      type: 'text/plain;charset=utf-8'
    } );
    saveAs( blob, 'yourMesh.obj' );
  },

  /** Export to Sketchfab */
  exportSketchfab: function() {
    if ( !this.mesh_ )
      return;
    Files.exportSketchfab( this.mesh_ );

    // Prevent shortcut keys from triggering in Sketchfab export
    $( '.skfb-uploader' ).on( 'keydown', function( e ) {
      e.stopPropagation();
    } );
  },

  /** When the user undos an action */
  onUndo: function() {
    this.states_.undo();
    this.render();
    this.gui_.updateMeshInfo();
  },

  /** When the user redos an action */
  onRedo: function() {
    this.states_.redo();
    this.render();
    this.gui_.updateMeshInfo();
  }
};