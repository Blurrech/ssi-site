/*
Application: Population Builder
Description: An app for estimating the population of a set of small areas
Filename: popbuilder.js
Copyright: Oliver Hawkins, 2015-16
Requires: D3 (d3), Leaflet (L)

Old constituency: #FF00B0
New constituency: #00E0FF
New constituency old: #00A0FF
Link blue: #3b99fc
*/

(function (window, document, d3, L) {

"use strict";

// Set up global application object
var cb = {};
window.cb = cb;

/* Constructor for the MapView object, a singleton that manages the state 
of the Leaflet map. */
cb.MapView = function(map) {

	this.map = map;
	this.tileLayer = null;
	this.electorate = null;
	this.areaInfo = null;
	this.boundaryLayers = null;
	this.wardLayer = null;
	this.oldConLayer = null;

	/* Mapbox tileLayer settings {id} ------------------------------ */
	var tileLayerPath = 'https://api.tiles.mapbox.com/v4/mapbox.streets-basic/{z}/{x}/{y}.png?access_token={accessToken}',
		tileLayerAttribution = 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Imagery © <a href="http://mapbox.com">Mapbox</a>',
		tileLayerMaxZoom = 18,
		tileLayerId = 'olihawkins.92f42d47',
		tileLayerAccessToken = 'pk.eyJ1Ijoib2xpaGF3a2lucyIsImEiOiI0NjczZTY5NTYyYTdhMGQ1MTU0NTRhYzE0MDkzYzk3YSJ9.7Svk19EtaKQ4M3EKiso-ag';
	
	/* Mapbox tile layer */
	this.tileLayer = L.tileLayer(tileLayerPath, {
		attribution: tileLayerAttribution,
		maxZoom: tileLayerMaxZoom,
		id: tileLayerId,
		accessToken: tileLayerAccessToken
	});

	/* OpenStreetMap tile layer
	this.tileLayer = L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
		maxZoom: 19,
		attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
	}).addTo(map);
	*/

	/* Settings for the electors control ------------------------------ */
	this.electorate = L.control();

	// Sets up the control on the map
	this.electorate.onAdd = function(map) {

		this._div = L.DomUtil.create('div', 'electorate leaflet-control-layers');
		this.update(0);
		return this._div;
	};

	// Updates the electors control with the given electorate
	this.electorate.update = function(electorate) {

		if (electorate > 0) {

			var electorate = cb.numberWithCommas(electorate);
			this._div.innerHTML = '<h4>Electorate</h4><p><span ' +
				'class="number">' + electorate + '</span></p>' + 
				'<p><span class="action" ' +
				'onclick="cb.mapController.getResults();">' + 
				'Get Data</span></p>';

		} else {

			var electorate = cb.numberWithCommas(electorate);
			this._div.innerHTML = '<h4>Electorate</h4>' + 
				'<p><span class="number">0</span></p>';
		}
	};
	
	/* Settings for the area information control ------------------------------ */
	this.areaInfo = L.control({position: 'bottomright'});

	// Sets up the control on the map
	this.areaInfo.onAdd = function(map) {

		this._div = L.DomUtil.create('div', 'areainfo leaflet-control-layers');
		this.update('', '', '', 0);
		return this._div;
	};

	// Updates the area information control with the electorates for each area
	this.areaInfo.update = function(areaLabel, areaName, areaCode, electorate) {

		var areaLabel = (areaLabel !== '') ? areaLabel : 'Area Information';
		var areaCode = (areaCode !== '') ? areaCode : '&hellip;';
		var areaName = (areaName !== '') ? areaName : '&hellip;';
		var electorate = cb.numberWithCommas(electorate);

		this._div.innerHTML = '<h4>' + areaLabel + '</h4>' + 
			'<p><span class="label">' + areaCode + '</span></p>' +
			'<div class="areaname"><p><span class="label">' + areaName + '</span></p></div>' + 
			'<h4>Electorate</h4><p>' + 
			'<span class="label">' + electorate + '</span></p>' + 
			'<span class="action" onclick="cb.mapController.deselectAll();">' +
			'Clear Map</span></p>';
	};

	// Bulds the map from the downloaded layers
	this.buildMap = function(wardLayer, oldConLayer, newConLayer) {

		this.wardLayer = wardLayer;
		this.oldConLayer = oldConLayer;
		this.newConLayer = newConLayer;

		var boundaries = {
			'Wards': wardLayer,
			'Current Constituencies': oldConLayer,
			'Proposed Constituencies': newConLayer
		};

		// Creates a layer group control
		this.boundaryLayers = L.control.layers({}, boundaries, 
			{position: 'bottomright', collapsed: false});

		this.oldConLayer.setZIndex(1);
		this.newConLayer.setZIndex(2);
		this.wardLayer.setZIndex(3);

		this.tileLayer.addTo(this.map);
		this.oldConLayer.addTo(this.map);
		this.newConLayer.addTo(this.map);
		this.wardLayer.addTo(this.map);

		this.electorate.addTo(this.map);
		this.boundaryLayers.addTo(this.map);
		this.areaInfo.addTo(this.map);
	};
};

/* Constructor for the MapModel object, a singleton that manages the state 
of the MapView. The MapController updates the MapModel with changes 
arising from events, and the MapModel updates the MapView. */
cb.MapModel = function(mapView) {

	this.mapView = mapView;
	this.boundaryDownloads = 3;
	this.wardLayer = null;
	this.oldConLayer = null;
	this.newConLayer = null;
	this.selectedFeatures = {};
	this.selectedWards = {};
	this.selectedElectorate = 0;
	this.highlightedWard = null;
	this.highlightedWardCode = '';
	this.highlightedOldCon = null;
	this.highlightedOldConCode = '';
	this.highlightedNewCon = null;
	this.highlightedNewConCode = '';
	this.boundaryLayers = [
		'Current Constituencies', 
		'Proposed Constituencies', 
		'Wards'
	];

	var mapModel = this;

	/* Layers ------------------------------ */

	// Event handlers to register the visibility and order of layers
	this.mapView.map.on('overlayadd', function(e) {

		// Add the new layer to the top of the array
		mapModel.boundaryLayers.push(e.name);
		
		// Clear any highlights
		mapModel.alwaysClearCurrentWard();
		mapModel.alwaysClearCurrentOldCon();
		mapModel.alwaysClearCurrentNewCon();
		mapModel.setAreaInfo('', '', '', 0);

		// Make the width of the lower constituency boundary bigger
		if (e.name === 'Proposed Constituencies' && 
			mapModel.boundaryLayers.indexOf('Current Constituencies') > -1) {
			mapModel.oldConLayer.setStyle({weight: 5});
			mapModel.newConLayer.setStyle({weight: 4});
		}

		if (e.name === 'Current Constituencies' && 
			mapModel.boundaryLayers.indexOf('Proposed Constituencies') > -1) {
			mapModel.oldConLayer.setStyle({weight: 4});
			mapModel.newConLayer.setStyle({weight: 5});
		}
	});

	this.mapView.map.on('overlayremove', function(e) {

		// Get the inddex of the layer being removed
		var layerIndex = mapModel.boundaryLayers.indexOf(e.name);

		// Clear any highlights
		if (layerIndex === mapModel.boundaryLayers.length -1) {
		
			mapModel.alwaysClearCurrentWard();
			mapModel.alwaysClearCurrentOldCon();
			mapModel.alwaysClearCurrentNewCon();
			mapModel.setAreaInfo('', '', '', 0);
		}

		// Remove the layer from the array
		mapModel.boundaryLayers.splice(layerIndex, 1);

		// Reset the constituency boundary widths
		if (e.name === 'Proposed Constituencies') {
			mapModel.oldConLayer.setStyle({weight: 4});
		}
		
		if (e.name === 'Current Constituencies') {
			mapModel.newConLayer.setStyle({weight: 4});
		}

	});

	this.updateConstituencyWidths = function(layerName) {

		
	}

	// Used by event handlers on features to respond only when layer is top
	this.isActiveLayer = function(layerName) {

		var n = this.boundaryLayers.length;

		if (n === 0) {

			return false;

		} else {

			if (this.boundaryLayers[n-1] === layerName) {
			 	
			 	return true
			
			} else {
		 		
		 		return false;			
			}
		}
	};

	// Registers that layers have downloaded asynchronously 
	this.registerDownload = function() {

		this.boundaryDownloads = this.boundaryDownloads - 1;
		
		if (this.boundaryDownloads === 0) {
			this.mapView.buildMap(this.wardLayer, this.oldConLayer, this.newConLayer);
		}
	};

	// Sets the displayed area information
	this.setAreaInfo = function(areaLabel, areaName, areaCode, electorate) {

		this.mapView.areaInfo.update(areaLabel, areaName, areaCode, electorate);
	};

	/* Regions ------------------------------ */

	// Handles adding layers to the map and tracking their state
	this.activateRegion = function(regionCode) {

		var mapModel = this,
			mapView = this.mapView,
			wardLayer, oldConLayer, newConLayer;

		// The callback function used to retrieve json data for wards
		var downloadWards = function(error, json) {

			// Stop and log an error if the json does not return
			if (error) return console.warn(error);

			wardLayer = L.geoJson(json, {
				className: regionCode, 
				color: '#606060',
				opacity: 1.0,
				weight: 1, 
				fillColor: '#606060',
				fillOpacity: 0.0,
				onEachFeature: function(feature, layer) {

					feature.properties.selected = false;

					layer.on('click', function(e) {
						
						if (feature.properties.selected) {

							mapModel.deselectWard(feature, e.target);
						
						} else {

							mapModel.selectWard(feature, e.target);
						}
					});

					layer.on('dblclick', function(e) {

						var z = mapView.map.getZoom() + (e.originalEvent.shiftKey ? -1: 1);
						mapView.map.setZoomAround(e.containerPoint, z);
					});

					layer.on('mouseover', function(e) {

						mapModel.setHighlightedWard(feature, e.target);
					});

					layer.on('mousemove', function(e) {

						mapModel.setCurrentWard(feature, e.target);
					});

					layer.on('mouseout', function(e) {

						mapModel.clearCurrentWard();
					});

					layer.on('contextmenu', function(e) {

						mapModel.setHighlightedWard(feature, e.target);
					});
				}
			});
			
			mapModel.wardLayer = wardLayer;
			mapModel.registerDownload();
		};

		// The callback function used to retrieve json data for old constituencies
		var downloadOldCons = function(error, json) {

			// Stop and log an error if the json does not return
			if (error) return console.warn(error);

			oldConLayer = L.geoJson(json, {
				className: regionCode, 
				color: '#FF00B0',
				opacity: 1.0,
				weight: 5,
				fillOpacity: 0.0,
				onEachFeature: function(feature, layer) {

					layer.on('dblclick', function(e) {

						var z = mapView.map.getZoom() + (e.originalEvent.shiftKey ? -1: 1);
						mapView.map.setZoomAround(e.containerPoint, z);
					});

					layer.on('mouseover', function(e) {

						mapModel.setHighlightedOldCon(feature, e.target);
					});

					layer.on('mousemove', function(e) {

						mapModel.setCurrentOldCon(feature, e.target);
					});

					layer.on('mouseout', function(e) {

						mapModel.clearCurrentOldCon();
					});

					layer.on('contextmenu', function(e) {

						mapModel.setHighlightedOldCon(feature, e.target);
					});
				}
			});
			
			mapModel.oldConLayer = oldConLayer;
			mapModel.registerDownload();
		};

		// The callback function used to retrieve json data for new constituencies
		var downloadNewCons = function(error, json) {
			// Stop and log an error if the json does not return
			if (error) return console.warn(error);
			newConLayer = L.geoJson(json, {
				className: regionCode, 
				color: '#00E0FF',
				opacity: 1.0,
				weight: 4,
				fillOpacity: 0.0,
				onEachFeature: function(feature, layer) {
					layer.on('dblclick', function(e) {
						var z = mapView.map.getZoom() + (e.originalEvent.shiftKey ? -1: 1);
						mapView.map.setZoomAround(e.containerPoint, z);
					});
					layer.on('mouseover', function(e) {
						mapModel.setHighlightedNewCon(feature, e.target);
					});
					layer.on('mousemove', function(e) {
						mapModel.setCurrentNewCon(feature, e.target);
					});
					layer.on('mouseout', function(e) {
						mapModel.clearCurrentNewCon();
					});
					layer.on('contextmenu', function(e) {
						mapModel.setHighlightedNewCon(feature, e.target);
					});
				}
			});
			mapModel.newConLayer = newConLayer;
			mapModel.registerDownload();
		};

		// Download wards
		var wardJsonPath = 'C:/Users/Paul/Desktop/font-awesome-4.7.0/small_state_institute_dashboard/alpha/tools/constituencyboundaries/wards/' + regionCode + '.json';
		d3.json(wardJsonPath, downloadWards);

		// Download old constituencies
		var oldConJsonPath = 'C:/Users/Paul/Desktop/font-awesome-4.7.0/small_state_institute_dashboard/alpha/tools/constituencyboundaries/constituencies/' + regionCode + '.json';
		d3.json(oldConJsonPath, downloadOldCons);

		// Download new constituencies
		var newConJsonPath = 'C:/Users/Paul/Desktop/font-awesome-4.7.0/small_state_institute_dashboard/alpha/tools/constituencyboundaries/constituencies/old/' + regionCode + '.json';
		d3.json(newConJsonPath, downloadNewCons);
	};

	/* Wards ------------------------------ */

	// Handles the selection of wards
	this.selectWard = function(feature, layer) {

		if (this.isActiveLayer('Wards')) {

			feature.properties.selected = true;
			this.selectedFeatures[feature.properties.WD15CD] = feature;
			this.selectedWards[feature.properties.WD15CD] = layer;
			this.selectedElectorate += parseInt(feature.properties.electorate, 10);
			layer.setStyle({fillOpacity: 0.4});
			this.mapView.electorate.update(this.selectedElectorate);
		}
	};

	// Handles the deselection of wards
	this.deselectWard = function(feature, layer) {

		if (this.isActiveLayer('Wards')) {

			this.alwaysDeselectWard(feature, layer);
		}
	};

	// Sets the current ward
	this.setCurrentWard = function(feature, layer) {

		if (this.isActiveLayer('Wards')) {

			var areaName = feature.properties.WD15NM;
			var areaCode = feature.properties.WD15CD;
			var electorate = feature.properties.electorate;

			this.setAreaInfo('Wards', areaName, areaCode, electorate);

			if (this.highlightedWard === null) {

				this.setHighlightedWard(feature, layer);
			}
		} 
	};

	// Resets the current ward
	this.clearCurrentWard = function() {

		if (this.isActiveLayer('Wards')) {

			this.alwaysClearCurrentWard();
		}
	};

	// Sets the highlighted ward
	this.setHighlightedWard = function(feature, layer) {	

		if (this.isActiveLayer('Wards')) {

			if (this.highlightedWard !== null) {

				if (this.highlightedWard === layer) {

					this.clearCurrentWard();
					return;
				
				} else {

					this.highlightedWard.setStyle({color: '#606060',opacity: 1.0, weight: 1});
					this.clearCurrentWard();
					this.highlightedWard = null;
					this.highlightedWardCode = '';
				}
			}

			layer.bringToFront();
			layer.setStyle({color: '#FFCC00', opacity: 1.0, weight: 4});
			this.highlightedWard = layer;
			this.highlightedWardCode = feature.properties.WD15CD;
			this.setCurrentWard(feature, layer);
		}
	};

	// Always deselects the given ward, whether ward layer is active or not
	this.alwaysDeselectWard = function(feature, layer) {

		feature.properties.selected = false;
		delete this.selectedFeatures[feature.properties.WD15CD];
		delete this.selectedWards[feature.properties.WD15CD];
		this.selectedElectorate -= parseInt(feature.properties.electorate, 10);
		layer.setStyle({fillOpacity: 0.0});
		this.mapView.electorate.update(this.selectedElectorate);
	};

	// Always resets the current ward, whether ward layer is active or not
	this.alwaysClearCurrentWard = function() {

		if (this.highlightedWard !== null) {
		
			this.highlightedWard.setStyle({color: '#606060', opacity: 1.0, weight: 1});
			this.highlightedWard = null;
			this.highlightedWardCode = '';
		}
	
		this.setAreaInfo('', '', '', 0);
	};

	// Deselects all wards on the map
	this.deselectAllWards = function() {

		for (var wardCode in this.selectedFeatures) {

			var feature = this.selectedFeatures[wardCode];
			var layer = this.selectedWards[wardCode];
			this.alwaysDeselectWard(feature, layer)

		}
	};

	/* Old constituencies ------------------------------ */

	// Sets the current old constituency 
	this.setCurrentOldCon = function(feature, layer) {

		if (this.isActiveLayer('Current Constituencies')) {

			var areaName = feature.properties.PCON11NM;
			var areaCode = feature.properties.PCON11CD;
			var electorate = feature.properties.electorate;

			this.setAreaInfo('Current Constituencies', areaName, areaCode, electorate);

			if (this.highlightedOldCon === null) {

				this.setHighlightedOldCon(feature, layer);
			}
		}
	};

	// Resets the current old constituency
	this.clearCurrentOldCon = function() {

		if (this.isActiveLayer('Current Constituencies')) {

			this.alwaysClearCurrentOldCon();
		}
	};

	// Sets the highlighted old constituency
	this.setHighlightedOldCon = function(feature, layer) {	

		if (this.isActiveLayer('Current Constituencies')) {

			if (this.highlightedOldCon !== null) {

				if (this.highlightedOldCon === layer) {

					this.clearCurrentOldCon();
					return;
				
				} else {

					this.highlightedOldCon.setStyle({color: '#FF00B0', weight: 4});
					this.clearCurrentOldCon();
					this.highlightedOldCon = null;
					this.highlightedOldConCode = '';
				}
			}

			layer.bringToFront();
			layer.setStyle({color: '#FFCC00', weight: 4});
			this.highlightedOldCon = layer;
			this.highlightedOldConCode = feature.properties.PCON11CD;
			this.setCurrentOldCon(feature, layer);
		}
	};

	// Always resets the current consttuency, whether layer is active or not
	this.alwaysClearCurrentOldCon = function() {

		if (this.highlightedOldCon !== null) {
			
			this.highlightedOldCon.setStyle({color: '#FF00B0', weight: 4});
			this.highlightedOldCon = null;
			this.highlightedOldConCode = '';
		}
		
		this.setAreaInfo('', '', '', 0);
	};

	/* New constituencies ------------------------------ */

	// Sets the current new constituency 
	this.setCurrentNewCon = function(feature, layer) {

		if (this.isActiveLayer('Proposed Constituencies')) {

			var areaName = feature.properties.PCON16NM;
			var areaCode = feature.properties.PCON16CD;
			var electorate = feature.properties.electorate;

			this.setAreaInfo('Proposed Constituencies', areaName, areaCode, electorate);

			if (this.highlightedNewCon === null) {

				this.setHighlightedNewCon(feature, layer);
			}
		}
	};

	// Resets the current new constituency
	this.clearCurrentNewCon = function() {

		if (this.isActiveLayer('Proposed Constituencies')) {

			this.alwaysClearCurrentNewCon();
		}
	};

	// Sets the highlighted new constituency
	this.setHighlightedNewCon = function(feature, layer) {	

		if (this.isActiveLayer('Proposed Constituencies')) {

			if (this.highlightedNewCon !== null) {

				if (this.highlightedNewCon === layer) {

					this.clearCurrentNewCon();
					return;
				
				} else {

					this.highlightedNewCon.setStyle({color: '#00E0FF', weight: 4});
					this.clearCurrentNewCon();
					this.highlightedNewCon = null;
					this.highlightedNewConCode = '';
				}
			}

			layer.bringToFront();
			layer.setStyle({color: '#FFCC00', weight: 4});
			this.highlightedNewCon = layer;
			this.highlightedNewConCode = feature.properties.PCON16CD;
			this.setCurrentNewCon(feature, layer);
		}
	};

	// Always resets the current consttuency, whether layer is active or not
	this.alwaysClearCurrentNewCon = function() {

		if (this.highlightedNewCon !== null) {
			
			this.highlightedNewCon.setStyle({color: '#00E0FF', weight: 4});
			this.highlightedNewCon = null;
			this.highlightedNewConCode = '';
		}
		
		this.setAreaInfo('', '', '', 0);
	};
};

/* Constructor for the MapController object, a singleton that handles user 
events and updates the MapModel accordingly. */
cb.MapController = function(mapModel) {

	this.mapModel = mapModel;

	// Sets up the initial map by loading the regional boundaries
	this.setupMap = function(regionCode) {

		this.mapModel.activateRegion(regionCode);
	}

	// Clears overlays from map and the current zone code
	this.clearMap = function() {

		this.mapModel.setDistrictsInView([]);
		this.mapModel.clearCurrentZone();
	};

	// Switches to the next overlay state, called by the overlay control
	this.changeOverlaySetting = function() {

		return
	};

	// Clears the selected areas
	this.deselectAll = function() {

		this.mapModel.deselectAllWards();
		this.mapModel.clearCurrentWard();
		this.mapModel.clearCurrentOldCon();
	}

	// Sends the selected areas to the results page
	this.getResults = function() {

		var selectedWardCodes = Object.keys(this.mapModel.selectedWards);
		var wardCodeString = selectedWardCodes.join(',');
		var postParameters = {zones: wardCodeString};
		var resultsPage = '/download';
		cb.submitForm(resultsPage, postParameters);
	};
};

// The function to start the application
cb.run = function(coordinates, zoomLevel, regionCode) { 

	// Initialise the map
	var map = L.map('map').setView(coordinates, zoomLevel);

	// Initialise the MVC objects
	var mapView = new cb.MapView(map);
	var mapModel = new cb.MapModel(mapView);
	var mapController = new cb.MapController(mapModel);

	// Add an interface to the mapController to the global object for controls
	cb.mapController = mapController; 
		
	// Setup the map
	mapController.setupMap(regionCode);
};

// Utility function: Number formatter
cb.numberWithCommas = function(num) {

	var parts = num.toString().split(".");
	parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	return parts.join(".");
};

// Utility function: Submit a post request
cb.submitForm = function(path, params, method) {

	method = method || "post"; 
 
	var form = document.createElement("form");
	form.setAttribute("method", method);
	form.setAttribute("action", path);
 
	/* Move the submit function to another variable
	so that it doesn't get overwritten */
	form._submit_function_ = form.submit;
 
	for(var key in params) {
		
		if(params.hasOwnProperty(key)) {

			var hiddenField = document.createElement("input");
			hiddenField.setAttribute("type", "hidden");
			hiddenField.setAttribute("name", key);
			hiddenField.setAttribute("value", params[key]);
			form.appendChild(hiddenField);
		 }
	}
 
	document.body.appendChild(form);
	form._submit_function_();
};

}(window, document, d3, L));