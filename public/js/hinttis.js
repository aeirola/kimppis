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

var directionsService;
var directionsRenderer;
var distanceMatrixService;

/*
 * 
 * Page 1 (Map)
 */
 
$('#page1').live("pagecreate", function() {
    $('#map_canvas').gmap( { 'zoom': 11, 
                             'mapTypeControl': false,
                             'keyboardShortcuts': false,
                             'panControl': false,
                             'rotateControl': false,
                             'scaleControl': false,
                             'streetViewControl': false,
                             'callback': 
        function (newMap) {
			map = newMap;
			navigator.geolocation.getCurrentPosition(function(position, status) {
					var markerPosition = new google.maps.LatLng(position.coords.latitude, position.coords.longitude);
                    map.panTo(markerPosition);
	                
					// Add marker
					origin = new google.maps.Marker({
						position: markerPosition,
						map: map,
						draggable: true,
						icon: START_MARKER,
						shadow: MARKER_SHADOW
					});
		            google.maps.event.addListener(origin, 'dragend', update_route);
			});
            
            // Add event listener
            google.maps.event.addListener(map, 'click', function (event) {
                // Add marker
				var marker = new google.maps.Marker({
					position: event.latLng,
					map: map,
					draggable: true
				});
				
				destinations.push(marker);
				
				update_route();
				
				google.maps.event.addListener(marker, 'click', function (event) {
					for (var i in destinations) {
						if (destinations[i] === marker) {
							destinations.splice(i,1);
						}
					}
					marker.setMap(null);
					update_route();
				});
				
	            google.maps.event.addListener(marker, 'dragend', update_route);
            });
			
            directionsRenderer = new google.maps.DirectionsRenderer();
            directionsRenderer.setOptions({
				suppressMarkers: true,
                hideRouteList: true
            });
        }
    });
	
    directionsService = new google.maps.DirectionsService();
    distanceMatrixService = new google.maps.DistanceMatrixService();
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
	
	// Get distances
    var distances = getDistances(distanceMatrix, bestRoute);
    
	// Get persons
	var persons = []
	for (i in bestRoute) {
		persons[i] = 1;
	}
	
	// Get costs
    costs = calculate_costs(distances, persons);
	
    // Populate table
    var table = $('#route_summary_table');
    table.empty();
	
    var stop_counter = 1;
	var totalCost = 0;
	var totalDistance = 0;
    for (var i in bestRoute ) {
        var stop = "Stop " + stop_counter;
      	stop_counter += 1;
		
        var km = distances[i] / 1000;
        var cost = Math.round(costs[i]*100)/100;
        var address = distanceMatrix.destinationAddresses[bestRoute[i]];
		
		totalCost += cost;
		totalDistance = km;
        
        table.append('<tr><td><strong>' + stop + '</strong> (' + km + ' km)</td><td style="float:right;"><strong>' + 
                                                cost + ' €</strong></td></tr>');
        table.append('<tr><td colspan="2">' + address + '</td></tr>');
        table.append('<tr><td colspan="2"><hr /></td></tr>');
    }
            
    table.append('<tr><td><strong>TOTAL</strong> ('+ totalDistance +' km)</td>'+
                 '<td style="float:right;"><strong>' + totalCost + ' €</strong></td></tr>');
    table.append('<tr><td></td><td></td></tr>');
});

/*
*
*	Hinttis-specific functions
*/

var hinttis = {};

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
}

hinttis.updateRoute = function() {
	if (!destinations.length) {
		directionsRenderer.setMap(null);
		return;
	}
	
	var originLatLng = origin.getPosition();
	var destinationLatLngs = [];
	for (var i in destinations) {
		destinationLatLngs.push(destinations[i].getPosition());
	}
	
	getDistanceMatrix(originLatLng, destinationLatLngs, function(matrix) {
		distanceMatrix = matrix;
		bestRoute = getBestRoute(matrix);
		
		// Create waypoints
		var waypoints = []
	    var destination = destinationLatLngs[bestRoute[bestRoute.length-1]];
	    for (var i = 0; i < bestRoute.length-1; i++) {
	        waypoints.push({location: destinationLatLngs[bestRoute[i]]});
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
	            directionsRenderer.setDirections(result);
				directionsRenderer.setMap(map);
	        } else {
	            console.log(status);
	        }
	    });
	});
}

