'use strict';

function Gui(sculptgl)
{
  this.sculptgl_ = sculptgl; //main application

  //ui stuffs
  this.ctrlColor_ = null; //color controller
  this.ctrlShaders_ = null; //shaders controller
  this.flatShading_ = null; //flat shading controller
  this.ctrlSculpt_ = null; //sculpt controller
  this.ctrlClay_ = null; //clay sculpting controller
  this.ctrlNegative_ = null; //negative sculpting controller
  this.ctrlContinuous_ = null; //continuous sculpting controller
  this.ctrlSymmetry_ = null; //symmetry controller
  this.ctrlSculptCulling_ = null; //sculpt culling controller
  this.ctrlRadius_ = null; //radius controller
  this.ctrlIntensity_ = null; //intensity sculpting controller
  this.ctrlDetailSubdivision_ = null; //subdivision detail slider
  this.ctrlDetailDecimation_ = null; //decimation detail slider
  this.ctrlNbVertices_ = null; //display number of vertices controller
  this.ctrlNbTriangles_ = null; //display number of triangles controller
  this.ctrlCut_ = null; //apply cut controller
  this.ctrlFillHoles_ = null; //fill holes controller
  this.ctrlSubdDetailCut_ = null; //subdivision detail (fill holes) controller

  this.foldTopo_ = null; //fold topo controller

  //files functions
  this.open_ = this.openFile; //open file button (trigger hidden html input...)
  this.saveOBJ_ = this.saveFileAsOBJ; //save mesh as OBJ
  this.savePLY_ = this.saveFileAsPLY; //save mesh as PLY
  this.saveSTL_ = this.saveFileAsSTL; //save mesh as STL

  //online exporters
  this.keySketchfab_ = ''; //sketchfab api key
  this.exportSketchfab_ = this.exportSketchfab; //upload file on sketchfab

  //background functions
  this.resetBg_ = this.resetBackground; //reset background
  this.importBg_ = this.importBackground; //import background image

  //functions
  this.resetCamera_ = this.resetCamera; //reset camera position and rotation

  //misc
  this.dummyFunc_ = function () {}; //empty function... stupid trick to get a simple button in dat.gui
}

Gui.prototype = {
  /** Initialize dat-gui stuffs */
  initGui: function ()
  {
    var guiContainer = document.getElementById('gui-container');
    var guiEditing = new dat.GUI();
    this.initEditingGui(guiEditing);
    guiContainer.appendChild(guiEditing.domElement);

    this.initGeneralGui();

    var main = this.sculptgl_;
    guiEditing.domElement.addEventListener('mouseout', function ()
    {
      main.focusGui_ = false;
    }, false);
    guiEditing.domElement.addEventListener('mouseover', function ()
    {
      main.focusGui_ = true;
    }, false);
  },

  /** Initialize the general gui (on the left) */
  initGeneralGui: function (gui)
  {
    var self = this;
    var main = this.sculptgl_;

    // File
    $('#load-file').on('click', this.open_.bind(this));
    $('#save-obj').on('click', this.saveOBJ_.bind(this));
    $('#save-ply').on('click', this.savePLY_.bind(this));
    $('#save-stl').on('click', this.saveSTL_.bind(this));

    // History
    $('#undo').on('click', main.undo_.bind(main));
    $('#redo').on('click', main.redo_.bind(main));

    // Reset camera
    $('#resetcamera').on('click', this.resetCamera_.bind(this));

    // Background
    $('#resetbg').on('click', this.resetBg_.bind(this));
    $('#importbg').on('click', this.importBg_.bind(this));

    //Camera fold
    // this.ctrlFov_ = cameraFold.add(main.camera_, 'fov_', 10, 80).name('Fov');
    // this.ctrlFov_.onChange(function (value)
    // {
    //   main.camera_.updateProjection();
    //   main.render();
    // });

    // Options
    $('.togglable').on('click', function ()
    {
      var group = $(this).data('radio');
      if (group)
      {
        $(this).siblings('li[data-radio=' + group + ']').removeClass('checked');
        $(this).addClass('checked');

        if (group === 'camera-mode')
        {
          main.camera_.mode_ = (parseInt($(this).data('value'), 10));
        }
        if (group === 'camera-type')
        {
          main.camera_.type_ = (parseInt($(this).data('value'), 10));
          // self.ctrlFov_.__li.hidden = main.camera_.type_ === Camera.projType.ORTHOGRAPHIC;
          main.camera_.updateProjection();
          main.render();
        }
      }
      else
      {
        $(this).toggleClass('checked');

        if ($(this).data('value') === 'radius')
        {
          main.usePenRadius_ = !main.usePenRadius_;
        }
        else if ($(this).data('value') === 'intensity')
        {
          main.usePenIntensity_ = !main.usePenIntensity_;
        }
        else if ($(this).data('value') === 'pivot')
        {
          main.camera_.toggleUsePivot();
          main.camera_.usePivot_ = !main.camera_.usePivot_;
          main.render();
        }
      }
    });

    // About
    $('#about').on('click', function ()
    {
      $('#about-popup').addClass('visible');
    });

    $('#about-popup .cancel').on('click', function ()
    {
      $('#about-popup').removeClass('visible');
    });

    // Buttons
    $('#reset').on('click', main.resetSphere_.bind(main));
    $('#export').on('click', this.exportSketchfab_.bind(this));
  },

  /** Initialize the mesh editing gui (on the right) */
  initEditingGui: function (gui)
  {
    var main = this.sculptgl_;
    var self = this;

    //sculpt fold
    var foldSculpt = gui.addFolder('Sculpt');
    var optionsSculpt = {
      'Brush (1)': Sculpt.tool.BRUSH,
      'Inflate (2)': Sculpt.tool.INFLATE,
      'Rotate (3)': Sculpt.tool.ROTATE,
      'Smooth (4)': Sculpt.tool.SMOOTH,
      'Flatten (5)': Sculpt.tool.FLATTEN,
      'Pinch (6)': Sculpt.tool.PINCH,
      'Crease (7)': Sculpt.tool.CREASE,
      'Drag (8)': Sculpt.tool.DRAG,
      'Paint (9)': Sculpt.tool.COLOR,
      'Scale (0)': Sculpt.tool.SCALE,
      'Cut': Sculpt.tool.CUT
    };
    this.ctrlSculpt_ = foldSculpt.add(main.sculpt_, 'tool_', optionsSculpt).name('Tool');
    this.ctrlSculpt_.onChange(function (value)
    {
      main.sculpt_.tool_ = parseInt(value, 10);
      var tool = main.sculpt_.tool_;
      var st = Sculpt.tool;
      self.ctrlClay_.__li.hidden = tool !== st.BRUSH;
      self.ctrlNegative_.__li.hidden = tool !== st.BRUSH && tool !== st.INFLATE && tool !== st.CREASE;
      self.ctrlContinuous_.__li.hidden = tool === st.ROTATE || tool === st.DRAG || tool === st.SCALE || tool === st.CUT;
      self.ctrlSymmetry_.__li.hidden = tool === st.CUT;
      self.ctrlSculptCulling_.__li.hidden = tool === st.CUT;
      self.ctrlRadius_.__li.hidden = tool === st.CUT;
      self.ctrlIntensity_.__li.hidden = self.ctrlContinuous_.__li.hidden;
      self.ctrlColor_.__li.hidden = tool !== st.COLOR;
      self.ctrlCut_.__li.hidden = tool !== st.CUT;
      self.ctrlFillHoles_.__li.hidden = tool !== st.CUT;
      self.ctrlSubdDetailCut_.__li.hidden = tool !== st.CUT;
      self.foldTopo_.__ul.hidden = tool === st.CUT;
      if (tool === st.CUT)
      {
        $('#perspective').hide();
        $('#orthographic').click();
      }
      else
      {
        $('#perspective').show();
        main.sculpt_.lineOrigin_ = [0, 0];
        main.sculpt_.lineNormal_ = [0, 0];
      }
    });
    this.ctrlClay_ = foldSculpt.add(main.sculpt_, 'clay_').name('Clay');
    this.ctrlNegative_ = foldSculpt.add(main.sculpt_, 'negative_').name('Negative (N)');
    this.ctrlContinuous_ = foldSculpt.add(main, 'continuous_').name('Continuous');
    this.ctrlSymmetry_ = foldSculpt.add(main, 'symmetry_').name('Symmetry');
    this.ctrlSculptCulling_ = foldSculpt.add(main.sculpt_, 'culling_').name('Sculpt culling');
    this.ctrlRadius_ = foldSculpt.add(main.picking_, 'rDisplay_', 5, 200).name('Radius');
    this.ctrlIntensity_ = foldSculpt.add(main.sculpt_, 'intensity_', 0, 1).name('Intensity');
    this.ctrlCut_ = foldSculpt.add(main, 'cut_', 0, 1).name('Click to cut !');
    this.ctrlCut_.__li.hidden = true;
    this.ctrlFillHoles_ = foldSculpt.add(main.sculpt_, 'fillHoles_', 0, 1).name('fill holes (buggy)');
    this.ctrlSubdDetailCut_ = foldSculpt.add(main.sculpt_, 'subdDetailCut_', 0, 4).name('Detail');
    this.ctrlSubdDetailCut_.__li.hidden = true;
    this.ctrlFillHoles_.__li.hidden = true;
    foldSculpt.open();

    //topo fold
    this.foldTopo_ = gui.addFolder('Topology');
    var optionsTopo = {
      'Static': Sculpt.topo.STATIC,
      'Dynamic': Sculpt.topo.SUBDIVISION,
      'Adaptive (!)': Sculpt.topo.ADAPTIVE
    };
    var ctrlTopo = this.foldTopo_.add(main.sculpt_, 'topo_', optionsTopo).name('Tool');
    ctrlTopo.onChange(function (value)
    {
      main.sculpt_.topo_ = parseInt(value, 10);
      var topo = main.sculpt_.topo_;
      var st = Sculpt.topo;
      self.ctrlDetailSubdivision_.__li.hidden = topo === st.STATIC;
      self.ctrlDetailDecimation_.__li.hidden = topo !== st.SUBDIVISION;
    });
    this.ctrlDetailSubdivision_ = this.foldTopo_.add(main.sculpt_, 'detailSubdivision_', 0, 1).name('Subdivision');
    this.ctrlDetailDecimation_ = this.foldTopo_.add(main.sculpt_, 'detailDecimation_', 0, 1).name('Decimation');
    this.foldTopo_.open();

    //mesh fold
    var foldMesh = gui.addFolder('Mesh');
    this.ctrlNbVertices_ = foldMesh.add(this, 'dummyFunc_').name('Ver : 0');
    this.ctrlNbTriangles_ = foldMesh.add(this, 'dummyFunc_').name('Tri : 0');
    var optionsShaders = {
      'Phong': Shader.mode.PHONG,
      'Transparency': Shader.mode.TRANSPARENCY,
      'Wireframe': Shader.mode.WIREFRAME,
      'Normal shader': Shader.mode.NORMAL,
      'Clay': Shader.mode.MATERIAL,
      'Chavant': Shader.mode.MATERIAL + 1,
      'Skin': Shader.mode.MATERIAL + 2,
      'Drink': Shader.mode.MATERIAL + 3,
      'Red velvet': Shader.mode.MATERIAL + 4,
      'Orange': Shader.mode.MATERIAL + 5,
      'Bronze': Shader.mode.MATERIAL + 6
    };
    this.ctrlShaders_ = foldMesh.add(new Shader(), 'type_', optionsShaders).name('Shader');
    this.ctrlShaders_.onChange(function (value)
    {
      if (main.mesh_)
      {
        main.mesh_.initRender(parseInt(value, 10), main.textures_, main.shaders_);
        main.render();
      }
    });
    this.ctrlFlatShading_ = foldMesh.add(new Render(), 'flatShading_').name('flat shading');
    this.ctrlFlatShading_.onChange(function (value)
    {
      if (main.mesh_)
      {
        main.mesh_.render_.flatShading_ = value;
        main.mesh_.updateBuffers();
        main.render();
      }
    });

    this.ctrlColor_ = foldMesh.addColor(main.sculpt_, 'color_').name('Color');
    this.ctrlColor_.onChange(function (value)
    {
      if (value.length === 3) // rgb [255, 255, 255]
      {
        main.sculpt_.color_ = [value[0], value[1], value[2]];
      }
      else if (value.length === 7) // hex (24 bits style) "#ffaabb"
      {
        var intVal = parseInt(value.slice(1), 16);
        main.sculpt_.color_ = [(intVal >> 16), (intVal >> 8 & 0xff), (intVal & 0xff)];
      }
      else // fuck it
        main.sculpt_.color_ = [168, 66, 66];
    });
    this.ctrlColor_.__li.hidden = true;
    foldMesh.open();
  },

  /** Update gui stuffs in relation to the mesh */
  updateMesh: function (mesh)
  {
    if (!mesh)
      return;
    mesh.render_.shader_.type_ = this.ctrlShaders_.getValue();
    this.ctrlShaders_.object = mesh.render_.shader_;
    mesh.render_.flatShading_ = this.ctrlFlatShading_.getValue();
    this.updateMeshInfo();
  },

  /** Update number of vertices and triangles */
  updateMeshInfo: function ()
  {
    var mesh = this.sculptgl_.mesh_;
    if (!mesh)
      return;
    this.ctrlNbVertices_.name('Ver : ' + mesh.vertices_.length);
    this.ctrlNbTriangles_.name('Tri : ' + mesh.triangles_.length);
  },

  /** Open file */
  openFile: function ()
  {
    $('#fileopen').trigger('click');
  },

  /** Reset background */
  resetBackground: function ()
  {
    var bg = this.sculptgl_.background_;
    if (bg)
    {
      var gl = bg.gl_;
      gl.deleteTexture(bg.backgroundLoc_);
      this.sculptgl_.background_ = null;
      this.sculptgl_.render();
    }
  },

  /** Immort background */
  resetCamera: function ()
  {
    this.sculptgl_.camera_.reset();
    this.sculptgl_.render();
  },

  /** Immort background */
  importBackground: function ()
  {
    $('#backgroundopen').trigger('click');
  },

  /** Save file as OBJ*/
  saveFileAsOBJ: function ()
  {
    if (!this.sculptgl_.mesh_)
      return;
    var data = [Export.exportOBJ(this.sculptgl_.mesh_)];
    var blob = new Blob(data,
    {
      type: 'text/plain;charset=utf-8'
    });
    saveAs(blob, 'yourMesh.obj');
  },

  /** Save file as PLY */
  saveFileAsPLY: function ()
  {
    if (!this.sculptgl_.mesh_)
      return;
    var data = [Export.exportPLY(this.sculptgl_.mesh_)];
    var blob = new Blob(data,
    {
      type: 'text/plain;charset=utf-8'
    });
    saveAs(blob, 'yourMesh.ply');
  },

  /** Save file as STL */
  saveFileAsSTL: function ()
  {
    if (!this.sculptgl_.mesh_)
      return;
    var data = [Export.exportSTL(this.sculptgl_.mesh_)];
    var blob = new Blob(data,
    {
      type: 'text/plain;charset=utf-8'
    });
    saveAs(blob, 'yourMesh.stl');
  },

  /** Export to Sketchfab */
  exportSketchfab: function ()
  {
    if (!this.sculptgl_.mesh_)
      return;
    Export.exportSketchfab(this.sculptgl_.mesh_, [58, 224, 224]);

    // Prevent shortcut keys from triggering in Sketchfab export
    $('.skfb-uploader').on('keydown', function (e)
    {
      e.stopPropagation();
    });
  }
};