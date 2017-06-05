var renderer, scene, camera, raycaster, meshes = [];
var mouse = new THREE.Vector2();

var counties = d3.map();

// transormation matrix
var positioning;

var RO_CENTER = [35.0094303, 45.9442858];
var MAX_EXTRUSION = 10;

var variables = [], current_variable;

var numberFormatter = d3.format('0,000');

// function that maps value int to extrusion value
// requires the maximum possible value
var getExtrusion;

// function that maps value int to luminance
// requires the maximum possible value
var getLuminance;

function initRenderer() {
	renderer = new THREE.WebGLRenderer();

	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.setClearColor(0x000000);

	document.body.appendChild(renderer.domElement);
}

function initThree() {
	initRenderer();

	raycaster = new THREE.Raycaster();

	scene = new THREE.Scene();

	initCamera();
	initLights();

	controls = new THREE.TrackballControls(camera, renderer.domElement);
	controls.minDistance = 10;
	controls.maxDistance = 50;

	animate();
}

function initCamera() {
	camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 10000);
	camera.position.set(-8.278324114488553, 23.715105536749885, 5.334970045945842);
	camera.up.set(-0.3079731382492934, 0.9436692395156481, -0.12099963846565401);

	// restoreCameraOrientation(camera);
}

function initLights() {
	var pointLight = new THREE.PointLight(0xFFFFFF);
	pointLight.position.set(-800, 800, 800);
	scene.add(pointLight);

	var pointLight2 = new THREE.PointLight(0xFFFFFF);
	pointLight2.position.set(800, 800, 800);
	scene.add(pointLight2);

	var pointLight3 = new THREE.PointLight(0xFFFFFF);
	pointLight3.position.set(0, 800, -800);
	scene.add(pointLight3);
}

function initLine() {
    var material = new THREE.LineBasicMaterial({
        color: 0x0000ff
    });

	var geometry = new THREE.Geometry();
	geometry.vertices.push(
		new THREE.Vector3( 0, 0, 0 ),
		new THREE.Vector3( 0, 100, 0 )
	);

	var line = new THREE.Line( geometry, material );
	scene.add( line );
}

//check
function updateInfoBox() {
	raycaster.setFromCamera( mouse, camera );

	var intersects = raycaster.intersectObjects(scene.children);

	var html = '';

	for (var i=0; i<intersects.length; i++) {
		var countyCode = intersects[i].object.userData.countyCode;
		if (countyCode) {
			var county = counties.get(countyCode);
			var value = county.get(current_variable); 
			html = county.get('name') + ': ' + numberFormatter(value);
			break;
		}
	}

	document.getElementById('infobox').innerHTML = html;
}

function animate() {
	controls.update();
	renderer.render(scene, camera);
	updateInfoBox();

	requestAnimationFrame(animate);
}

function onDocumentMouseMove( event ) {
	mouse.x = ( event.clientX / window.innerWidth ) * 2 - 1;
	mouse.y = - ( event.clientY / window.innerHeight ) * 2 + 1;
}

function onWindowResize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();

	renderer.setSize(window.innerWidth, window.innerHeight);
}


function cameraIter(callback) {
	['position', 'up'].forEach(callback);
}

function saveCameraOrientation() {
	cameraIter(function (key) {
		sessionStorage.setItem('camera.' + key, JSON.stringify(camera[key].toArray()));
	});
}

function restoreCameraOrientation() {
	cameraIter(function (key) {
		var val = JSON.parse(sessionStorage.getItem('camera.' + key));
		if (val) {
			camera[key].fromArray(val);
		}
	});
}


function initGeometry(features) {
	var path = d3.geo.path().projection(d3.geo.mercator().center(RO_CENTER));

	features.forEach(function(feature) {

		if (path(feature)) {
			var contour = transformSVGPath(path(feature));
			var county = counties.get(feature.properties.COUNTY);
			county.set('contour', contour);
			county.set('name', feature.properties.NAME);
		} else {
			console.log('ERROR : ',feature.properties);
		}
	});
}

function initPositioningTransform() {
	positioning = new THREE.Matrix4();

	var tmp = new THREE.Matrix4();
	positioning.multiply(tmp.makeRotationX(Math.PI/2));
	positioning.multiply(tmp.makeTranslation(-480, -250, 0));
}

function updateMeshes(variable) {
	// remove curren meshes
	meshes.forEach(function(mesh) {
		scene.remove(mesh);
	});

	meshes = counties.entries().map(function(entry) {
		var countyCode = entry.key, county = entry.value;
		var value = county.get(variable);
		var extrusion = getExtrusion(value);
		var luminance = getLuminance(value);
		var color = d3.hsl(105, 0.8, luminance).toString();

		var extrudeMaterial = new THREE.MeshLambertMaterial({color: color}); 
		var faceMaterial = new THREE.MeshBasicMaterial({color: color});

		if (county.get('contour')) {

			var geometry = county.get('contour').extrude({
				amount: extrusion,
				bevelEnabled: false,
				extrudeMaterial: 0,
				material: 1
			});

			var mesh = new THREE.Mesh(geometry, new THREE.MeshFaceMaterial(
				[extrudeMaterial, faceMaterial]));

			mesh.userData.countyCode = countyCode;

			mesh.applyMatrix(positioning);
			mesh.translateZ(-extrusion);

			scene.add(mesh);

			return mesh;
		}
	});
}

// concurrently load multiple data sources; the callback will be invoked when everything is loaded
function loadData(sources, callback) {
	var remaining = sources.length;
	var results = {}

	sources.forEach(function(source) {
		function handler(error, data) {
			if (error) throw error;

			results[source.key] = data;

			remaining--;

			if (!remaining) {
				callback(results);
			}
		}

		args = source.args.slice();
		args.push(handler);
		d3[source.type].apply(d3, args);
	});
}

var dataSources = [
	{type: 'json', args: ['map/us.json'], key: 'us'},
	{type: 'csv', args: ['data/display_data.csv'], key: 'display_data'}
];

function extractVariables(display_data) {
	return Object.keys(display_data[0]).filter(function(key) {
		key = key.replace(' ','');
		return key !== 'FIPS';
	});
}

function prepareCensusData(display_data) {
	var max_value = 0;
	var variable_sums = {};

	display_data.forEach(function(row) {
		var countyCode = row.FIPS.replace(' ','');

		var datum = d3.map();

		variables.forEach(function(variable) {
			var value = Number(row[variable]);

			datum.set(variable, value);

			if (value > max_value) {
				max_value = value;
			}
		});

		counties.set(countyCode, datum);
	});
	return max_value;
}

initThree();
initPositioningTransform();
// initLine();

var VariableButtons = React.createClass({
	getVariableFromHash: function() {
		var re = new RegExp('#/var/*');
		var match = window.location.hash.match(re);
		var current_variable;

		if (match) {
			current_variable = +match[1];
			if (this.props.variables.indexOf(current_variable) > -1) {
				return current_variable;
			}
		}

		return false;
	},

	getInitialState: function() {
		var current_variable = this.getVariableFromHash();

		if (!current_variable) {
			current_variable = this.props.variables[0];
		}

		return {current_variable: current_variable};
	},

	componentDidMount: function() {
		window.addEventListener('hashchange', this.onHashChange);
	},

	componentWillUnmount: function() {
		window.removeEventListener('hashchange', this.onHashChange);
	},

	onHashChange: function(variable) {
		var variable = this.getVariableFromHash();

		if (variable) {
			this.setState({current_variable: variable});
		}
	},

	render: function() {
		var self = this;

		current_variable = self.state.current_variable;  // used by infobox
		
		updateMeshes(this.state.current_variable);

		function createButton(variable) {
			var classes = classNames({
				'btn': true,
				'btn-default': true,
				'active': variable == self.state.current_variable
			});

			return <a className={classes} key={variable} href={'#/var/' + variable}>{variable}</a>;
		}

		return <div id="current-variable" className="btn-group" role="group">{self.props.variables.map(createButton)}</div>;
	}
});

loadData(dataSources, function(results) {
	variables = extractVariables(results.display_data);	
	var max_value = prepareCensusData(results.display_data);

	getExtrusion = d3.scale.linear().domain([0, max_value]).range([0, MAX_EXTRUSION]);
	getLuminance = d3.scale.linear().domain([0, max_value]);

	var us = results.us;

	var features = topojson.feature(us, us.objects['us_counties']).features;
	initGeometry(features);

	React.render(<VariableButtons variables={variables} />, document.getElementById('container'));
});

document.addEventListener('mousemove', onDocumentMouseMove);
window.addEventListener('resize', onWindowResize);
window.addEventListener('beforeunload', saveCameraOrientation);
