// Constants
var START_MARKER = 'https://chart.googleapis.com/chart?chst=d_map_pin_icon&chld=beer|4477FF';
var MARKER_SHADOW = new google.maps.MarkerImage('http://maps.gstatic.com/mapfiles/markers2/marker_sprite.png',
												new google.maps.Size(28,35),	// Size
												new google.maps.Point(28,0),	// Origin
												new google.maps.Point(2,34));	// Anchor

// Variables
var origin = null;
var destinations = [];

var distanceMatrix = null;
var bestRoute = null;
var map = null;

var distanceMatrixService;
var directionsService = new google.maps.DirectionsService();
var directionsRenderers = [];

/*
 * 
 * Page 1 (Map)
 */
 
$('#page1').live("pagecreate", function() {
    $('#map_canvas').gmap( { 'center': common.getLatLng(),
							 'zoom': 11, 
                             'mapTypeControl': false,
                             'keyboardShortcuts': false,
                             'panControl': false,
                             'rotateControl': false,
                             'scaleControl': false,
                             'streetViewControl': false,
                             'callback': 
        function (newMap) {
			map = newMap;
			
			
			createOriginMarker = function(markerPosition) {
                    map.panTo(markerPosition);
	                
					// Add marker
					origin = new google.maps.Marker({
						position: markerPosition,
						map: map,
						draggable: true,
						icon: START_MARKER,
						shadow: MARKER_SHADOW
					});
		            google.maps.event.addListener(origin, 'dragend', hinttis.updateRoute);
			};
			
			positionSuccess = function(position) {
				var markerPosition = new google.maps.LatLng(position.coords.latitude, position.coords.longitude);
				createOriginMarker(markerPosition);
			}
			
			positionError = function() {
				var markerPosition = common.getLatLng();
				createOriginMarker(markerPosition);
			}
			
			navigator.geolocation.getCurrentPosition(positionSuccess, positionError, {maximumAge: 60000, timeout: 1000});
            
            // Add event listener
            google.maps.event.addListener(map, 'click', function (event) {
                // Add marker
				var marker = new google.maps.Marker({
					position: event.latLng,
					map: map,
					draggable: true
				});
				
				destinations.push({persons: 1, marker: marker});
				
				hinttis.updateRoute();
				
				google.maps.event.addListener(marker, 'click', function (event) {
					for (var i in destinations) {
						if (destinations[i].marker === marker) {
							destinations.splice(i,1);
						}
					}
					marker.setMap(null);
					hinttis.updateRoute();
				});
				
	            google.maps.event.addListener(marker, 'dragend', hinttis.updateRoute);
            });
        }
    });
	
	distanceMatrixService = new google.maps.DistanceMatrixService();
	directionsService = new google.maps.DirectionsService();
});

/*
 * 
 * Page 2 (Route data)
 */
$('#page2').live("pageshow", function() {
    if (!distanceMatrix) {
        $.mobile.changePage($('#page1'), {reverse: true});
        return;
    }
	
	hinttis.updateCosts();
});

/*
*
*	Hinttis-specific functions
*/

var hinttis = {};

hinttis.updateRoute = function() {
	if (!destinations.length) {
		directionsRenderer.setMap(null);
		return;
	}
	
	var originLatLng = origin.getPosition();
	var destinationLatLngs = [];
	for (var i in destinations) {
		destinationLatLngs.push(destinations[i].marker.getPosition());
	}
	
	hinttis.getDistanceMatrix(originLatLng, destinationLatLngs, function(matrix) {
		distanceMatrix = matrix;
		bestRoute = common.getBestRoute(matrix, true);

		hinttis.clearDirectionsRenderers();
		
		for (var route_id in bestRoute) {
			var route = bestRoute[route_id];
			
			// Create waypoints
			var waypoints = []
		    var destination = destinationLatLngs[route[route.length-1]];
		    for (var i = 0; i < route.length-1; i++) {
		        waypoints.push({location: destinationLatLngs[route[i]]});
		    }
		
		    // Show directions
		    var directions_request = {
		        origin: originLatLng,
		        destination: destination,
		        waypoints: waypoints,
		        provideRouteAlternatives: false,
		        unitSystem: google.maps.UnitSystem.METRIC,
		        travelMode: google.maps.TravelMode.DRIVING
		    };
	        directionsService.route(directions_request, function(result, status) {
		        if (status == google.maps.DirectionsStatus.OK) {
					var directionsRenderer = hinttis.getDirectionsRenderer(route_id);
		            directionsRenderer.setDirections(result);
					directionsRenderer.setMap(map);
		        } else {
		            console.log(status);
		        }
		    });
		}
	});
};

hinttis.getDirectionsRenderer = function(i) {
	var color = hinttis.getColor(directionsRenderers.length);
	
    var renderer = new google.maps.DirectionsRenderer({
		suppressMarkers: true,
        hideRouteList: true,
		preserveViewport: true,
		polylineOptions: {
			strokeColor: color,
			strokeWeight: 5,
			strokeOpacity: 0.4
		}
    });
	directionsRenderers.push(renderer);
	
	return renderer
}

hinttis.clearDirectionsRenderers = function() {
	for (var i in directionsRenderers) {
		directionsRenderers[i].setMap(null);
	}
	
	directionsRenderers = []
}

hinttis.getColor = function(i) {
	switch(i) {
		case 0:
		return '#0000FF';
		case 1:
		return '#FF0000';
		case 2:
		return '#00FF00';
		case 3:
		return '#FF00FF';
		case 4:
		return '#00FFFF';
		default:
		return '#000000';
	}
}

hinttis.createDirectionsRenderer = function() {
	
	return directionsRenderer;
}

hinttis.getDistanceMatrix = function(origin, destinations, callback) {
    var origins = [origin];
    for (var i in destinations) {
        origins.push(destinations[i]);
    }
	
    distanceMatrixService.getDistanceMatrix({
        origins: origins,
        destinations: destinations,
        travelMode: google.maps.TravelMode.DRIVING,
        unitSystem: google.maps.UnitSystem.METRIC
    }, function(matrix, status) {
        if (status != google.maps.DistanceMatrixStatus.OK) {
            console.log(status);
        }
		
		callback(matrix)
	});
};

hinttis.updateCosts = function() {
	// Get distances
    var distances = common.getSplitDistances(distanceMatrix, bestRoute);
    
	// Get persons
	var persons = []
	for (var i in bestRoute) {
		persons[i] = [];
		var route = bestRoute[i];
		for (var j in route) {
			persons[i][j] = destinations[j].persons;
		}
	}
	
	// Get costs
    var costs = common.getSplitCosts(distances, persons);
	
    hinttis.updateTable(distances, costs);
	
}

hinttis.updateTable = function(distances, costs) {
    // Populate table
    var table = $('#route_summary_table');
    table.empty();
	
	for (var route_id in bestRoute) {
		var route = bestRoute[route_id];
		var totalCost = 0;
		var totalDistance = 0;
		
		if (bestRoute.length > 1) {
			var taxiTag = $('<strong/>', {text: "Taxi " + (parseInt(route_id)+1)});
			table.append($('<tr/>').append($('<td/>', {'class':'taxi_title'}).append(taxiTag)));	
		}
		
	    for (var stop_id in route ) {
		    var stop = "Stop " + (parseInt(stop_id)+1);
			var stopIndex = route[stop_id];
			var persons = parseInt(hinttis.getPersons(stopIndex));
		
	        var km = common.round(distances[route_id][stop_id] / 1000);
			totalDistance += km;
	        var cost = common.round(costs[route_id][stop_id]);
			var costPer = common.round(costs[route_id][stop_id] / persons);
	        var address = distanceMatrix.destinationAddresses[stopIndex];
		
			totalCost += cost;
		
			var titleTag = $('<strong/>', {text:stop, 'class': 'title'});
			var kmTag = $('<span/>', {text: km , 'class': 'km'});
			var costTag = $('<strong/>', {text: cost, 'class': 'cost'});
			if (persons > 1) {
				var costPerTag = $('<strong/>', {text: costPer, 'class': 'cost_per'});
			} else {
				var costPerTag = null;
			}
			var personsTag = $('<span/>', {'class': 'persons'});
			for (var person = 1; person <= 4 ; person++) {
				if (person <= persons) {
					var image = $('<img/>', {'src': 'img/selected.png', 'alt': 'selected', 'class': 'person'});
				} else {
					var image = $('<img/>', {'src': 'img/unselected.png', 'alt': 'unselected', 'class': 'person'});
				}
				var personTag = $('<a/>', {
					'href': '#',
					'data-index': stopIndex,
					'data-persons': person,
					click: function(){
						hinttis.setPersons($(this).attr('data-index'), $(this).attr('data-persons'));
						hinttis.updateCosts();
					}
				}).append(image);
				personsTag.append(personTag);
			}
		
			table.append($('<tr/>').append($('<td/>').append(titleTag, kmTag, personsTag), $('<td/>', {'class': 'cost'}).append(costTag)));
			table.append($('<tr/>').append($('<td/>', {text: address, 'class': 'address'}), $('<td/>', {'class': 'cost_per'}).append(costPerTag)));
	    }
	
	    // Separator
	    table.append($('<tr/>').append($('<td/>', {'colspan': '2'}).append($('<hr/>'))));
	
		// Totals
	    totalDistance = common.round(totalDistance);
	    totalCost = common.round(totalCost);
		var totalTitleTag = $('<strong/>', {text: 'TOTAL'});
		var totalKmTag = $('<span/>', {text: totalDistance, 'class': 'km'});
		var totalCostTag = $('<strong/>', {text: totalCost, 'class': 'cost'});
		table.append($('<tr/>').append($('<td/>').append(totalTitleTag, totalKmTag), $('<td/>', {'class': 'cost'}).append(totalCostTag)));
	}
}

hinttis.setPersons = function(stopIndex, amount) {
	destinations[parseInt(stopIndex)].persons = parseInt(amount);
};

hinttis.getPersons = function(stopIndex) {
	return destinations[stopIndex].persons;
}
