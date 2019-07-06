import Renderer from 'claygl/src/Renderer';
import GLTFLoader from 'claygl/src/loader/GLTF';
import Vector3 from 'claygl/src/math/Vector3';
import Timeline from 'claygl/src/animation/Timeline';
import meshUtil from 'claygl/src/util/mesh';
import Task from 'claygl/src/async/Task';
import TaskGroup from 'claygl/src/async/TaskGroup';
import util from 'claygl/src/core/util';
import Node from 'claygl/src/Node';
import Mesh from 'claygl/src/Mesh';
import Material from 'claygl/src/Material';
import PlaneGeometry from 'claygl/src/geometry/Plane';
import Shader from 'claygl/src/Shader';
import RayPicking from 'claygl/src/picking/RayPicking';
import notifier from 'claygl/src/core/mixin/notifier';
import textureUtil from 'claygl/src/util/texture';
import TextureCube from 'claygl/src/TextureCube';

import RenderMain from './graphic/RenderMain';
import graphicHelper from './graphic/helper';
import SceneHelper from './graphic/SceneHelper';
import defaultSceneConfig from './defaultSceneConfig';
import * as zrUtil from 'zrender/src/core/util';

import getBoundingBoxWithSkinning from './util/getBoundingBoxWithSkinning';
import OrbitControl from 'claygl/src/plugin/OrbitControl';
import HotspotManager from './HotspotManager';

import groundGLSLCode from './graphic/ground.glsl.js';
Shader.import(groundGLSLCode);

var TEXTURES = ['diffuseMap', 'normalMap', 'emissiveMap', 'metalnessMap', 'roughnessMap', 'specularMap', 'glossinessMap'];

/**
 * @constructor
 * @param {HTMLDivElement} dom Root node
 * @param {Object} [sceneConfig]
 * @param {boolean} [sceneConfig.enablePicking]
 * @param {Object} [sceneConfig.shadow]
 * @param {boolean} [sceneConfig.devicePixelRatio]
 * @param {Object} [sceneConfig.postEffect]
 * @param {Object} [sceneConfig.mainLight]
 * @param {Object} [sceneConfig.ambientLight]
 * @param {Object} [sceneConfig.ambientCubemapLight]
 */
function Viewer(dom, sceneConfig) {

    sceneConfig = zrUtil.clone(sceneConfig);
    zrUtil.merge(sceneConfig, defaultSceneConfig);

    this.init(dom, sceneConfig);
}

Viewer.prototype.init = function (dom, opts) {
    opts = opts || {};

    /**
     * @type {HTMLDivElement}
     */
    this.root = dom;

    /**
     * @private
     */
    this._timeline = new Timeline();

    var renderer = new Renderer({
        devicePixelRatio: opts.devicePixelRatio || window.devicePixelRatio
    });
    dom.appendChild(renderer.canvas);
    renderer.canvas.style.cssText = 'position:absolute;left:0;top:0';

    /**
     * @private
     */
    this._renderer = renderer;

    this._renderMain = new RenderMain(renderer, opts.shadow, 'perspective');
    this._renderMain.afterRenderScene = (function (renderer, scene, camera) {
        this.trigger('renderscene', renderer, scene, camera);
    }).bind(this);
    this._renderMain.afterRenderAll = (function (renderer, scene, camera) {
        this.trigger('afterrender', renderer, scene, camera);
    }).bind(this);
    this._renderMain.preZ = opts.preZ || false;

    var cameraControl = this._cameraControl = new OrbitControl({
        renderer: renderer,
        timeline: this._timeline,
        domElement: dom
    });
    cameraControl.target = this._renderMain.camera;
    cameraControl.init();

    this._hotspotManager = new HotspotManager({
        dom: dom,
        renderer: renderer,
        camera: this._renderMain.camera
    });

    /**
     * List of skeletons
     */
    this._skeletons = [];
    /**
     * List of animation clips
     */
    this._clips = [];

    /**
     * List of takes.
     */
    this._takes = [];

    /**
     * Map of materials
     */
    this._materialsMap = {};

    this._sceneHelper = new SceneHelper(this._renderMain.scene);
    this._sceneHelper.initLight(this._renderMain.scene);

    this.resize();

    if (opts.postEffect) {
        this.setPostEffect(opts.postEffect);
    }
    if (opts.mainLight) {
        this.setMainLight(opts.mainLight);
    }
    if (opts.secondaryLight) {
        this.setSecondaryLight(opts.secondaryLight);
    }
    if (opts.tertiaryLight) {
        this.setTertiaryLight(opts.tertiaryLight);
    }
    if (opts.ambientCubemapLight) {
        this.setAmbientCubemapLight(opts.ambientCubemapLight);
    }
    if (opts.ambientLight) {
        this.setAmbientLight(opts.ambientLight);
    }
    if (opts.environment) {
        this.setEnvironment(opts.environment);
    }

    this._createGround();
    if (opts.ground) {
        this.setGround(opts.ground);
    }

    this.setCameraControl({
        distance: 20,
        minDisntance: 2,
        maxDistance: 100,
        center: [0, 0, 0]
    });

    this._enablePicking = opts.picking || false;

    this._initHandlers();

    cameraControl.on('update', function () {
        this.trigger('updatecamera', {
            center: cameraControl.getCenter(),
            alpha: cameraControl.getAlpha(),
            beta: cameraControl.getBeta(),
            distance: cameraControl.getDistance()
        });

        this.refresh();
    }, this);

};

Viewer.prototype._createGround = function () {
    var groundMesh = new Mesh({
        isGround: true,
        material: new Material({
            shader: new Shader({
                vertex: Shader.source('qmv.ground.vertex'),
                fragment: Shader.source('qmv.ground.fragment')
            }),
            transparent: true
        }),
        castShadow: false,
        geometry: new PlaneGeometry(),
        renderOrder: -10
    });
    groundMesh.material.set('color', [1, 1, 1, 1]);
    groundMesh.scale.set(40, 40, 1);
    groundMesh.rotation.rotateX(-Math.PI / 2);
    this._groundMesh = groundMesh;

    this._renderMain.scene.add(groundMesh);
};

Viewer.prototype._addModel = function (modelNode, nodes, skeletons, clips) {
    // Remove previous loaded
    this.removeModel();

    this._renderMain.scene.add(modelNode);

    this._skeletons = skeletons.slice();
    this._modelNode = modelNode;

    this._setAnimationClips(clips);

    // Not save if glTF has only animation info
    if (nodes && nodes.length) {
        this._nodes = nodes;
    }
    var materialsMap = {};
    modelNode.traverse(function (node) {
        // Save material
        if (node.material) {
            var material = node.material;
            // Avoid name duplicate
            materialsMap[material.name] = materialsMap[material.name] || [];
            materialsMap[material.name].push(material);
        }
    }, this);
    this._materialsMap = materialsMap;

    this._updateMaterialsSRGB();

    this._stopAccumulating();
};

Viewer.prototype._removeAnimationClips = function () {
    this._clips.forEach(function (clip) {
        this._timeline.removeClip(clip);
    }, this);
    this._clips = [];
    this._takes = [];
};

Viewer.prototype._setAnimationClips = function (clips) {
    var self = this;
    function refresh() {
        self.refresh();
    }
    clips.forEach(function (clip) {
        clip.tracks.forEach(function (track) {
            if (!track.target) {
                track.target = this._nodes[track.targetNodeIndex];
            }
        }, this);
        clip.onframe = refresh;

        this._timeline.addClip(clip);

        this._takes.push({
            name: clip.name,
            range: [0, clip.life],
            clip: clip
        });
    }, this);

    this._clips = clips.slice();
};

Viewer.prototype._initHandlers = function () {

    this._picking = new RayPicking({
        renderer: this._renderer,
        scene: this._renderMain.scene,
        camera: this._renderMain.camera
    });

    this._clickHandler = this._clickHandler.bind(this);
    this._mouseDownHandler = this._mouseDownHandler.bind(this);

    this.root.addEventListener('mousedown', this._mouseDownHandler);
    this.root.addEventListener('click', this._clickHandler);
};

Viewer.prototype._mouseDownHandler = function (e) {
    this._startX = e.clientX;
    this._startY = e.clientY;
};

Viewer.prototype._clickHandler = function (e) {
    if (!this._enablePicking && !this._renderMain.isDOFEnabled()) {
        return;
    }
    var dx = e.clientX - this._startX;
    var dy = e.clientY - this._startY;
    if (Math.sqrt(dx * dx + dy * dy) >= 5) {
        return;
    }

    var result = this._picking.pick(e.clientX, e.clientY, true);

    if (result && !result.target.isGround) {
        this._renderMain.setDOFFocusOnPoint(result.distance);
        this.trigger('doffocus', result);

        this._selectResult = result;
        this.trigger('select', result);

        this.refresh();
    }
    else {
        if (this._selectResult) {
            this.trigger('unselect', this._selectResult);
        }
        this._selectResult = null;
    }
};

/**
 * Enable picking
 */
Viewer.prototype.enablePicking = function () {
    this._enablePicking = true;
};
/**
 * Disable picking
 */
Viewer.prototype.disablePicking = function () {
    this._enablePicking = false;
};
/**
 * Model coordinate system is y up.
 */
Viewer.prototype.setModelUpAxis = function (upAxis) {
    var modelNode = this._modelNode;
    if (!modelNode) {
        return;
    }
    modelNode.position.set(0, 0, 0);
    modelNode.scale.set(1, 1, 1);
    modelNode.rotation.identity();
    if (upAxis.toLowerCase() === 'z') {
        modelNode.rotation.identity().rotateX(-Math.PI / 2);
    }

    this.autoFitModel();
};
Viewer.prototype.setTextureFlipY = function (flipY) {
    if (!this._modelNode) {
        return;
    }
    for (var key in this._materialsMap) {
        for (var i = 0; i < this._materialsMap[key].length; i++) {
            var mat = this._materialsMap[key][i];
            for (var k = 0; k < TEXTURES.length; k++) {
                var tex = mat.get(TEXTURES[k]);
                if (tex) {
                    tex.flipY = flipY;
                    tex.dirty();
                }
            }
        }
    }
    this.refresh();
};
 /**
 * Resize the viewport
 */
Viewer.prototype.resize = function () {
    var renderer = this._renderer;
    renderer.resize(this.root.clientWidth, this.root.clientHeight);
    this._renderMain.setViewport(0, 0, renderer.getWidth(), renderer.getHeight(), renderer.getDevicePixelRatio());

    this.refresh();
};

/**
 * Scale model to auto fit the camera.
 */
Viewer.prototype.autoFitModel = function (fitSize) {
    fitSize = fitSize || 10;
    if (this._modelNode) {
        this.setPose(10);
        this._modelNode.update();
        // Update skeleton after model node transform updated.
        this._skeletons.forEach(function (skeleton) {
            skeleton.update();
        });
        var bbox = getBoundingBoxWithSkinning(this._modelNode);

        var size = new Vector3();
        size.copy(bbox.max).sub(bbox.min);

        var center = new Vector3();
        center.copy(bbox.max).add(bbox.min).scale(0.5);

        // scale may be NaN if mesh is a plane.
        var scale = fitSize / Math.max(size.x, size.y, size.z) || 1;

        this._modelNode.scale.set(scale, scale, scale);
        this._modelNode.position.copy(center).scale(-scale);
        this._modelNode.update();

        this._hotspotManager.setBoundingBox(bbox.min.array, bbox.max.array);

        // FIXME, Do it in the renderer?
        this._modelNode.traverse(function (mesh) {
            if (mesh.isSkinnedMesh()) {
                mesh.geometry.boundingBox.applyTransform(this._modelNode.worldTransform);
            }
        }, this);

        // Fit the ground
        this._groundMesh.position.y = -size.y * scale / 2;

        this.refresh();
    }
};

/**
 * Load glTF model resource
 * @param {string|Object} gltfFile Model url or json
 * @param {Object} [opts]
 * @param {Object} [opts.shader='lambert'] 'basic'|'lambert'|'standard'
 * @param {boolean} [opts.includeTexture=true]
 * @param {Object} [opts.files] Pre-read files map
 * @param {Array.<ArrayBuffer>} [opts.buffers]
 * @param {boolean} [opts.upAxis='y'] Change model to y up if upAxis is 'z'
 * @param {boolean} [opts.textureFlipY=false]
 * @param {boolean} [opts.regenerateNormal=false] If regenerate per vertex normal.
 */
Viewer.prototype.loadModel = function (gltfFile, opts) {
    opts = opts || {};
    if (!gltfFile) {
        throw new Error('URL of model is not provided');
    }
    var shaderName = opts.shader || 'standard';

    var pathResolver = null;
    if (opts.files) {
        pathResolver = function (uri) {
            if (uri.match(/^data:(.*?)base64,/)) {
                return uri;
            }
            uri = uri.replace(/[\\\/]+/g, '/');
            var fileName = uri.substr(uri.lastIndexOf('/') + 1);
            if (opts.files[fileName]) {
                return opts.files[fileName];
            }
            else {
                return fileName || '';
            }
        };
    }
    var loaderOpts = {
        rootNode: new Node(),
        shader: 'clay.' + shaderName,
        textureRootPath: opts.textureRootPath,
        bufferRootPath: opts.bufferRootPath,
        crossOrigin: 'Anonymous',
        includeTexture: opts.includeTexture == null ? true : opts.includeTexture,
        textureFlipY: opts.textureFlipY,
        textureConvertToPOT: true
    };
    if (pathResolver) {
        loaderOpts.resolveTexturePath =
        loaderOpts.resolveBinaryPath = pathResolver;
    }

    var loader = new GLTFLoader(loaderOpts);
    if (typeof gltfFile === 'string') {
        loader.load(gltfFile);
    }
    else if (gltfFile instanceof ArrayBuffer) {
        loader.parseBinary(gltfFile);
    }
    else {
        loader.parse(gltfFile, opts.buffers);
    }

    if (opts.upAxis && opts.upAxis.toLowerCase() === 'z') {
        loader.rootNode.rotation.rotateX(-Math.PI / 2);
    }

    var task = new Task();

    var vertexCount = 0;
    var triangleCount = 0;
    var nodeCount = 0;

    loader.success(function (res) {
        res.rootNode.traverse(function (mesh) {
            nodeCount++;
            if (mesh.geometry) {
                triangleCount += mesh.geometry.triangleCount;
                vertexCount += mesh.geometry.vertexCount;
            }
        });
        this._preprocessModel(res.rootNode, opts);

        this._addModel(res.rootNode, res.nodes, res.skeletons, res.clips);

        this.autoFitModel();

        var stat = {
            triangleCount: triangleCount,
            vertexCount: vertexCount,
            nodeCount: nodeCount,
            meshCount: Object.keys(res.meshes).length,
            materialCount: Object.keys(res.materials).length,
            textureCount: Object.keys(res.textures).length
        };

        task.trigger('loadmodel', stat);

        var loadingTextures = [];
        util.each(res.textures, function (texture) {
            if (!texture.isRenderable()) {
                loadingTextures.push(texture);
            }
        });
        var taskGroup = new TaskGroup();
        taskGroup.allSettled(loadingTextures).success(function () {

            this._convertBumpToNormal();
            task.trigger('ready');
            this.refresh();
        }, this);

        this.refresh();
    }, this);
    loader.error(function () {
        task.trigger('error');
    });

    this._textureFlipY = opts.textureFlipY;
    this._shaderName = shaderName;

    return task;
};

Viewer.prototype._convertBumpToNormal = function () {
    for (var key in this._materialsMap) {
        for (var i = 0; i < this._materialsMap[key].length; i++) {
            var mat = this._materialsMap[key][i];
            var normalTexture = mat.get('normalMap');
            if (normalTexture && textureUtil.isHeightImage(normalTexture.image)) {
                var normalImage = textureUtil.heightToNormal(normalTexture.image);
                normalImage.srcImage = normalTexture.image;
                normalTexture.image = normalImage;
                normalTexture.dirty();
            }
        }
    }
};

/**
 * Remove current loaded model
 */
Viewer.prototype.removeModel = function () {
    var prevModelNode = this._modelNode;
    if (prevModelNode) {
        this._renderer.disposeNode(prevModelNode);
        this._renderMain.scene.remove(prevModelNode);
        this._modelNode = null;
        this.refresh();
    }
    this._removeAnimationClips();
    this._materialsMap = {};
    this._nodes = [];
    this._skeletons = [];
};

/**
 * Return scene.
 * @return {clay.Scene}
 */
Viewer.prototype.getScene = function () {
    return this._renderMain.scene;
};

/**
 * @return {clay.Node}
 */
Viewer.prototype.getModelRoot = function () {
    return this._modelNode;
};

Viewer.prototype._preprocessModel = function (rootNode, opts) {

    var alphaCutoff = opts.alphaCutoff;
    var doubleSided = opts.doubleSided;

    var meshNeedsSplit = [];
    rootNode.traverse(function (mesh) {
        if (mesh.skeleton) {
            meshNeedsSplit.push(mesh);
        }
    });
    meshNeedsSplit.forEach(function (mesh) {
        var newNode = meshUtil.splitByJoints(mesh, 15, true);
        if (newNode !== mesh) {
            newNode.eachChild(function (mesh) {
                mesh.originalMeshName = newNode.name;
            });
        }
    }, this);
    rootNode.traverse(function (mesh) {
        if (mesh.geometry) {
            // TODO Shared geometry? face normal?
            if (opts.regenerateNormal) {
                mesh.geometry.generateVertexNormals();
            }
            mesh.geometry.updateBoundingBox();
            if (doubleSided != null) {
                mesh.culling = !doubleSided;
            }
        }
        if (mesh.material) {
            mesh.material.define('fragment', 'DIFFUSEMAP_ALPHA_ALPHA');
            mesh.material.define('fragment', 'ALPHA_TEST');
            if (doubleSided != null) {
                mesh.material[doubleSided ? 'define' : 'undefine']('fragment', 'DOUBLE_SIDED');
            }
            mesh.material.precision = 'mediump';

            if (alphaCutoff != null) {
                mesh.material.set('alphaCutoff', alphaCutoff);
            }

            // Transparent mesh not cast shadow
            if (mesh.material.transparent) {
                mesh.castShadow = false;
            }
        }
    });

};

/**
 * Load animation glTF
 * @param {string} url
 */
Viewer.prototype.loadAnimation = function (url) {
    var loader = new GLTFLoader({
        rootNode: new Node(),
        crossOrigin: 'Anonymous'
    });
    loader.load(url);
    loader.success(function (res) {
        this._removeAnimationClips();
        this._setAnimationClips(res.clips);
    }, this);

    return loader;
};

/**
 * Pause animation
 */
Viewer.prototype.pauseAnimation = function () {
    this._clips.forEach(function (clip) {
        clip.pause();
    });
};

Viewer.prototype.stopAnimation = function () {
    this._clips.forEach(function (clip) {
        this._timeline.removeClip(clip);
    }, this);
};

/**
 * Resume animation
 */
Viewer.prototype.resumeAnimation = function () {
    this._clips.forEach(function (clip) {
        clip.resume();
    });
};

/**
 * @param {Object} [opts]
 * @param {number} [opts.distance]
 * @param {number} [opts.minDistance]
 * @param {number} [opts.maxDistance]
 * @param {number} [opts.alpha]
 * @param {number} [opts.beta]
 * @param {number} [opts.minAlpha]
 * @param {number} [opts.maxAlpha]
 * @param {number} [opts.minBeta]
 * @param {number} [opts.maxBeta]
 * @param {number} [opts.rotateSensitivity]
 * @param {number} [opts.panSensitivity]
 * @param {number} [opts.zoomSensitivity]
 */
Viewer.prototype.setCameraControl = function (opts) {
    this._cameraControl.setOption(opts);
    this.refresh();
};

/**
 * @param {Object} [opts]
 * @param {number} [opts.intensity]
 * @param {string} [opts.color]
 * @param {number} [opts.alpha]
 * @param {number} [opts.beta]
 * @param {number} [opts.shadow]
 * @param {number} [opts.shadowQuality]
 */
Viewer.prototype.setMainLight = function (opts) {
    this._sceneHelper.updateMainLight(opts, this);
    this.refresh();
};

/**
 * @param {Object} [opts]
 * @param {number} [opts.intensity]
 * @param {string} [opts.color]
 * @param {number} [opts.alpha]
 * @param {number} [opts.beta]
 * @param {number} [opts.shadow]
 * @param {number} [opts.shadowQuality]
 */
Viewer.prototype.setSecondaryLight = function (opts) {
    this._sceneHelper.updateSecondaryLight(opts, this);
    this.refresh();
};

/**
 * @param {Object} [opts]
 * @param {number} [opts.intensity]
 * @param {string} [opts.color]
 * @param {number} [opts.alpha]
 * @param {number} [opts.beta]
 * @param {number} [opts.shadow]
 * @param {number} [opts.shadowQuality]
 */
Viewer.prototype.setTertiaryLight = function (opts) {
    this._sceneHelper.updateTertiaryLight(opts, this);
    this.refresh();
};

/**
 * @param {Object} [opts]
 * @param {number} [opts.intensity]
 * @param {string} [opts.color]
 */
Viewer.prototype.setAmbientLight = function (opts) {
    this._sceneHelper.updateAmbientLight(opts, this);
    this.refresh();
};
/**
 * @param {Object} [opts]
 * @param {Object} [opts.texture]
 * @param {Object} [opts.exposure]
 * @param {number} [opts.diffuseIntensity]
 * @param {number} [opts.specularIntensity]
 */
Viewer.prototype.setAmbientCubemapLight = function (opts) {
    this._sceneHelper.updateAmbientCubemapLight(opts, this);
    this.refresh();
};

/**
 * @param {string} envUrl
 */
Viewer.prototype.setEnvironment = function (envUrl) {
    this._sceneHelper.updateSkybox(envUrl, this._renderMain.isLinearSpace(), this);
};

/**
 * @param {string|Array.<string>} matName
 * @param {Object} materialCfg
 * @param {boolean} [materialCfg.transparent]
 * @param {boolean} [materialCfg.alphaCutoff]
 * @param {boolean} [materialCfg.metalness]
 * @param {boolean} [materialCfg.roughness]
 */
Viewer.prototype.setMaterial = function (matName, materialCfg) {
    var renderer = this._renderer;
    materialCfg = materialCfg || {};
    if (! (matName instanceof Array)) {
        matName = [matName];
    }
    var materials = [];
    matName.forEach(function (singleMatName) {
        if (this._materialsMap[singleMatName]) {
            materials = materials.concat(this._materialsMap[singleMatName]);
        }
    }, this);
    var app = this;
    var textureFlipY = this._textureFlipY;
    if (!materials || !materials.length) {
        console.warn('Material %s not exits', matName.join(', '));
        return;
    }

    function haveTexture(val) {
        return val && val !== 'none';
    }
    var needTangents = false;
    function addTexture(propName) {
        // Not change if texture name is not in the config.
        if (propName in materialCfg) {
            if (haveTexture(materialCfg[propName])) {
                var isEnvironmentMap = propName === 'environmentMap';
                if (propName === 'normalMap' || propName === 'parallaxOcclusionMap') {
                    needTangents = true;
                }

                graphicHelper.loadTexture(materialCfg[propName], app, {
                    flipY: isEnvironmentMap ? false : textureFlipY,
                    anisotropic: isEnvironmentMap ? 1 : 8
                }, function (texture) {
                    if (propName === 'normalMap' && textureUtil.isHeightImage(texture.image)) {
                        var normalImage = textureUtil.heightToNormal(texture.image);
                        normalImage.srcImage = texture.image;
                        texture.image = normalImage;
                    }
                    else if (propName === 'environmentMap') {
                        var size = Math.round(texture.width / 4);
                        var cubemap = new TextureCube({
                            width: size,
                            height: size
                        });
                        // TODO No need to use environment map if there is ambient cubemap
                        textureUtil.panoramaToCubeMap(renderer, texture, cubemap);
                        // Use the cubemap.
                        texture = cubemap;
                    }
                    materials.forEach(function (mat) {
                        mat.set(propName, texture);
                    });
                    app.refresh();
                });
            }
            else {
                materials.forEach(function (mat) {
                    mat.set(propName, null);
                });
            }
        }
    }
    ['diffuseMap', 'normalMap', 'parallaxOcclusionMap', 'emissiveMap', 'environmentMap'].forEach(function (propName) {
        addTexture(propName);
    }, this);
    if (materials[0].isDefined('fragment', 'USE_METALNESS')) {
        ['metalnessMap', 'roughnessMap'].forEach(function (propName) {
            addTexture(propName);
        }, this);
    }
    else {
        ['specularMap', 'glossinessMap'].forEach(function (propName) {
            addTexture(propName);
        }, this);
    }

    if (needTangents) {
        this._modelNode.traverse(function (mesh) {
            if (mesh.material && matName.indexOf(mesh.material.name) >= 0) {
                if (!mesh.geometry.attributes.tangent.value) {
                    mesh.geometry.generateTangents();
                }
            }
        });
    }
    materials.forEach(function (mat) {
        if (materialCfg.transparent != null) {
            mat.transparent = !!materialCfg.transparent;
            mat.depthMask = !materialCfg.transparent;
        }
        ['color', 'emission', 'specularColor'].forEach(function (propName) {
            if (materialCfg[propName] != null) {
                mat.set(propName, graphicHelper.parseColor(materialCfg[propName]));
            }
        });
        ['alpha', 'alphaCutoff', 'metalness', 'roughness', 'glossiness', 'emissionIntensity', 'uvRepeat', 'parallaxOcclusionScale'].forEach(function (propName) {
            if (materialCfg[propName] != null) {
                mat.set(propName, materialCfg[propName]);
            }
        });
    }, this);
    this.refresh();
};

/**
 * @param {string} name
 */
Viewer.prototype.getMaterial = function (name) {
    var materials = this._materialsMap[name];
    if (!materials) {
        console.warn('Material %s not exits', name);
        return;
    }
    var mat = materials[0];
    var materialCfg = {
        name: name,
        transparent: mat.transparent
    };
    ['color', 'emission'].forEach(function (propName) {
        materialCfg[propName] = graphicHelper.stringifyColor(mat.get(propName), 'hex');
    });
    ['alpha', 'alphaCutoff', 'emissionIntensity', 'uvRepeat', 'parallaxOcclusionScale'].forEach(function (propName) {
        materialCfg[propName] = mat.get(propName);
    });
    function getTextureUri(propName) {
        var texture = mat.get(propName);
        if (!texture) {
            return '';
        }
        var image = texture.image;
        while (image.srcImage) {
            image = image.srcImage;
        }
        return (image && image.src) || '';
    }
    ['diffuseMap', 'normalMap', 'parallaxOcclusionMap', 'emissiveMap'].forEach(function (propName) {
        materialCfg[propName] = getTextureUri(propName);
    });
    if (mat.isDefined('fragment', 'USE_METALNESS')) {
        ['metalness', 'roughness'].forEach(function (propName) {
            materialCfg[propName] = mat.get(propName);
        });
        ['metalnessMap', 'roughnessMap'].forEach(function (propName) {
            materialCfg[propName] = getTextureUri(propName);
        });
        materialCfg.type = 'pbrMetallicRoughness';
    }
    else {
        materialCfg.specularColor = graphicHelper.stringifyColor(mat.get('specularColor'), 'hex');
        materialCfg.glossiness = mat.get('glossiness');
        ['specularMap', 'glossinessMap'].forEach(function (propName) {
            materialCfg[propName] = getTextureUri(propName);
        });
        materialCfg.type = 'pbrSpecularGlossiness';
    }

    return materialCfg;
};

/**
 * @param {Object} opts
 * @param {boolean} [opts.show]
 * @param {boolean} [opts.grid]
 */
Viewer.prototype.setGround = function (opts) {
    if ('show' in opts) {
        this._groundMesh.invisible = !opts.show;
    }
    if ('grid' in opts) {
        this._groundMesh.material.set('showGrid', opts.grid);
    }
    this.refresh();
};

/**
 * @return {Array.<string>}
 */
Viewer.prototype.getMaterialsNames = function () {
    return Object.keys(this._materialsMap);
};

/**
 * @param {Object} opts
 */
Viewer.prototype.setPostEffect = function (opts) {
    this._renderMain.setPostEffect(opts);

    this._updateMaterialsSRGB();
    this.refresh();
};

/**
 * Start loop.
 */
Viewer.prototype.start = function () {
    if (this._disposed) {
        console.warn('Viewer already disposed');
        return;
    }

    this._timeline.start();
    this._timeline.on('frame', this._loop, this);
};

/**
 * Stop loop.
 */
Viewer.prototype.stop = function () {
    this._timeline.stop();
    this._timeline.off('frame', this._loop);
};

/**
 * Add html tip
 */
Viewer.prototype.addHotspot = function (position, tipHTML) {
    return this._hotspotManager.add(position, tipHTML);
};

Viewer.prototype.setPose = function (time) {
    this._clips.forEach(function (clip) {
        clip.setTime(time);
    });
    this.refresh();
};

/**
 * Get duration of clip
 */
Viewer.prototype.getAnimationDuration = function () {
    var maxLife = 0;
    this._clips.forEach(function (clip) {
        maxLife = Math.max(clip.life, maxLife);
    });
    return maxLife;
};


Viewer.prototype.refresh = function () {
    this._needsRefresh = true;
};

Viewer.prototype.getRenderer = function () {
    return this._renderer;
};

Viewer.prototype._updateMaterialsSRGB = function () {
    var isLinearSpace = this._renderMain.isLinearSpace();
    for (var name in this._materialsMap) {
        var materials = this._materialsMap[name];
        for (var i = 0; i < materials.length; i++) {
            materials[i][isLinearSpace ? 'define' : 'undefine']('fragment', 'SRGB_DECODE');
        }
    }
};

Viewer.prototype._loop = function (deltaTime) {
    if (this._disposed) {
        return;
    }
    if (!this._needsRefresh) {
        return;
    }

    this._needsRefresh = false;

    this._renderMain.prepareRender();
    this._renderMain.render();
    // this._renderer.render(this._renderMain.scene, this._renderMain.camera);

    this._startAccumulating();

    this._hotspotManager.update();
};

var accumulatingId = 1;
Viewer.prototype._stopAccumulating = function () {
    this._accumulatingId = 0;
    clearTimeout(this._accumulatingTimeout);
};

Viewer.prototype._startAccumulating = function (immediate) {
    var self = this;
    this._stopAccumulating();

    var needsAccumulate = self._renderMain.needsAccumulate();
    if (!needsAccumulate) {
        return;
    }

    function accumulate(id) {
        if (!self._accumulatingId || id !== self._accumulatingId || self._disposed) {
            return;
        }

        var isFinished = self._renderMain.isAccumulateFinished() && needsAccumulate;

        if (!isFinished) {
            self._renderMain.render(true);

            if (immediate) {
                accumulate(id);
            }
            else {
                requestAnimationFrame(function () {
                    accumulate(id);
                });
            }
        }
    }

    this._accumulatingId = accumulatingId++;

    if (immediate) {
        accumulate(self._accumulatingId);
    }
    else {
        this._accumulatingTimeout = setTimeout(function () {
            accumulate(self._accumulatingId);
        }, 50);
    }
};

/**
 * Dispose viewer.
 */
Viewer.prototype.dispose = function () {
    this._disposed = true;

    this._renderer.disposeScene(this._renderMain.scene);
    this._renderMain.dispose(this._renderer);
    this._sceneHelper.dispose(this._renderer);

    this._renderer.dispose();
    this._cameraControl.dispose();
    this.root.removeEventListener('mousedown', this._mouseDownHandler);
    this.root.removeEventListener('click', this._clickHandler);
    this.root.innerHTML = '';

    this.off('select');
    this.off('doffocus');
    this.off('unselect');
    this.off('afterrender');
    this.off('updatecamera');

    this.stop();
};

util.extend(Viewer.prototype, notifier);

Viewer.version = '0.2.1';

export default Viewer;




