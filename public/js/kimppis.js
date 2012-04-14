// Constants
var REST_PATH = '/rest';
//var REST_PATH = 'http://localhost:8124/rest';

// Variables
var settings_persons = 1;
var settings_finder = true;
        
var position_latLng = null;
var destination_latLng = null;
        
var directionsService;
var directionsRenderer;
var distanceMatrixService;

var route_map = null;
var map_options = {
    
};

var own_index = null;
var route = null;
var route_points = [];
var total_data = {};

var notification_hash = "";
        
var polling = false;
  
var watch;

/*
 * 
 * Page 1 (Map)
 */
$('#page1').live("pagehide", function() {
    if ( navigator.geolocation ) {
        navigator.geolocation.clearWatch(watch);
    }
});

$('#page1').live("pagecreate", function() {
    $('#map_canvas').gmap( { center: common.getLatLng(), 
                             zoom: 11, 
                             mapTypeControl: false,
                             keyboardShortcuts: false,
                             panControl: false,
                             rotateControl: false,
                             scaleControl: false,
                             streetViewControl: false,
                             callback: 
        function (map) {
            // Add location
            if ( navigator.geolocation ) {
                watch = navigator.geolocation.watchPosition ( 
                    function( position ) { 
                        // Get position
                        position_latLng = new google.maps.LatLng(position.coords.latitude, 
                                                                 position.coords.longitude);
                                
                        // Set position
                        $('#map_canvas').gmap('clear', 'markers');
                        $('#map_canvas').gmap('addMarker', 
                            { 'title'    : 'You are here!', 
                              'bound'    : false, 
                              'position': position_latLng,
                              'icon'    : new google.maps.MarkerImage('img/blue-dot.png', null, null, new google.maps.Point(25, 25))
                              }
                        );
                        map.panTo( position_latLng );
                    }
                );
            }
            
            // Add event listener
            google.maps.event.addListener(map, 'click', function (event) {
                // Store positions, go to next page
                destination_latLng = event.latLng;
                $.mobile.changePage($('#page3'));
            });
        }
    });
});
        
        
/*
 * 
 * Page 2 (Settings)
 */
$('#radio1').change(function(event) {settings_persons = 1;});
$('#radio2').change(function(event) {settings_persons = 2;});
$('#radio3').change(function(event) {settings_persons = 3;});
$('#radio4').change(function(event) {settings_persons = 4;});
        
$('#toggleswitch1').change(function(event) {settings_finder = !settings_finder;});
        
/*
 * 
 * Page 3 (Route data)
 */
$('#page3').live("pageshow", function() {
    if (!position_latLng || !destination_latLng) {
        $.mobile.changePage($('#page1'), {reverse: true});
        return;
    }
            
    if (route) {
        return;
    }
            
    // Update form / to
    kimppis.latLngToString(destination_latLng, function(to_address) {
        $('#to_address').html(to_address);
                
        if (!settings_finder) {
            show_cost(to_address);
            return;
        }
                
        var route;
        var request;
        var requests;
        // Get route data
        $.ajax({
            type: 'PUT',
            url: REST_PATH + "/request",
            data: JSON.stringify({origin: [position_latLng.lng(), position_latLng.lat()],
                   destination: [destination_latLng.lng(), destination_latLng.lat()],
                     persons: settings_persons,
                destination_string: to_address
            }), 
            contentTypeString: 'application/json',
            dataType: 'json',
            success: function(route_data) {
                route = route_data.route;
                request = route_data.request;
                requests = route_data.requests;
                handle_route(route_data);

                // Poll for updates
                polling = true;
                setTimeout(function() { poll_request(route, request); }, 5000);
                        
            },
            fail: function(jqXHR, textStatus) {
                console.log(textStatus);
            }
        });
    });
});
        
function poll_request(route, request) {
    if (!polling) {
        return;
    }
            
    $.ajax({
        type: 'GET',
        url: REST_PATH + "/route/" + route._id,
        success: function(route_data) {
            // TODO: don't handle unless updated
            route_data.request = request;
            handle_route(route_data);
            setTimeout(function() { poll_request(route, request); }, 5000);
        },
        fail: function(jqXHR, textStatus) {
            console.log(textStatus);
        }
    });
}
        
$('#page3').live("pagecreate", function() {
    directionsService = new google.maps.DirectionsService();
    distanceMatrixService = new google.maps.DistanceMatrixService();
});
        
$('#page3').live("pagehide", function() {
    polling = false;
});
        
$('#accept_route').click(function() {
    // Update database
    $.ajax({
        type: 'POST',
        url: REST_PATH + "/request/complete/" + route_points[own_index].request._id
    });
});
        
$('#discard_route').click(function() {
    // Update database
    $.ajax({
        type: 'DELETE',
        url: REST_PATH + "/request/" + route_points[own_index].request._id
    });
            
    // Update client
    route = null;
});
        
function handle_route(route_data) {
    // Get data
    route = route_data.route;
    var request = route_data.request;
    var requests = route_data.requests;
    var stand = route.stand;
            
    var groups = requests.length;
            
    // Populate view
    $('#from_address').html(stand.name);
            
    if (groups >= 2) {
        $('#page3 .yksis').hide();
        $('#page3 .kimppis').show();
        $('#page3 #kimppises').html(groups -1);
    } else {
        $('#page3 .yksis').show();
        $('#page3 .kimppis').hide();
    }
            
    // Build destination matrix request
    var origins = [kimppis.buildLatLng(stand.position)];
    var destinations = [];
    for (var i in requests) {
        var latlng = kimppis.buildLatLng(requests[i].destination);
        origins.push(latlng);
        destinations.push(latlng);
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
		
		best_drive = common.getBestRoute(matrix);
		
        // Sort requests
        var sorted_requests = [];
        for (var i in best_drive) {
            sorted_requests.push(requests[best_drive[i]]);
        }
        requests = sorted_requests;
                
        // Get distances
		distances = common.getDistances(matrix, best_drive);
        
        // Get own id
        for (var r in requests) {
            if (request._id === requests[r]._id) {
                own_index = r;
                break;
            }
        }
        
        costs = common.getCosts(distances);
                
        route_points = [];
        var total_distance = 0;
        var total_cost = 0;
        for (var i in requests) {
            route_points[i] = {
                request: requests[i],
                distance: distances[i],
                cost: costs[i]
            };
            total_distance = distances[i];
            total_cost += costs[i];
        }
        total_data.distance = total_distance;
        total_data.cost = total_cost;
                
        kimppis_cost = costs[own_index];
        normal_cost = common.getCosts([matrix.rows[0].elements[own_index].distance.value], [request.persons]);
        difference = normal_cost - kimppis_cost;
                        
        // Update values
        $('#kimppis_price').html(Math.round(kimppis_cost*100)/100);
        $('#normal_price').html(Math.round(normal_cost*100)/100);
        $('#saved_price').html(Math.round(difference*100)/100);
    });
}
        
function show_cost(address) {
    var directions_request = {
            origin: position_latLng,
            destination: destination_latLng,
            provideRouteAlternatives: false,
            unitSystem: google.maps.UnitSystem.METRIC,
            travelMode: google.maps.TravelMode.DRIVING
    };
            
    // Get single distance
    directionsService.route(directions_request, function(result, status) {
        if (status === google.maps.DirectionsStatus.OK) {
            var distance = result.routes[0].legs[0].distance.value;
            var cost = common.getCosts([distance], [settings_persons]);
            
            route_points = [{
                distance: distance,
                cost: cost,
                request: {
                    origin: position_latLng,
                    destination: destination_latLng,
                    destination_string: address
                }
            }];
                    
            total_data = {
                distance: distance,
                cost: cost
            };
                    
            own_index = 0;
                    
            $.mobile.changePage($('#page6'));
        } else {
            console.log(status);
        }
    });
}
        
/*
 * 
 * Page 4 (Get ready)
 */
$('#page4').live("pageshow", function() {
    if (!route_points || !route_points.length) {
        $.mobile.changePage($('#page1'), {reverse: true});
        return;
    }
});
        
/*
 * 
 * Page 5 (Attract)
 */
$('#page5').live("pageshow", function() {
    if (!route_points || !route_points.length) {
        $.mobile.changePage($('#page1'), {reverse: true});
        return;
    }
});
        
/*
 * 
 * Page 6 (Summary)
 */
$('#page6').live("pageshow", function() {
    if (!route_points || !route_points.length) {
        $.mobile.changePage($('#page1'), {reverse: true});
        return;
    }
            
    var persons = route_points.length;
    var table = $('#route_summary_table');
    table.empty();
    var buddy;
    var buddy_counter = 1;
    for (var i in route_points ) {
        if (i == own_index) {
            buddy = "You";
        } else {
            buddy = "Buddy " + buddy_counter;
            buddy_counter += 1;
        }
        var route_point = route_points[i];
        var km = route_point.distance / 1000;
        var cost = Math.round(route_point.cost*100)/100;
        var address = route_point.request.destination_string;
                
        table.append('<tr><td><strong>' + buddy + '</strong> (' + km + ' km)</td><td style="float:right;"><strong>' + 
                                                cost + ' €</strong></td></tr>');
        table.append('<tr><td colspan="2">' + address + '</td></tr>');
        table.append('<tr><td colspan="2"><hr /></td></tr>');
    }
            
    var total_km = total_data.distance / 1000;
    var total_cost = Math.round(total_data.cost*100)/100;
    table.append('<tr><td><strong>TOTAL</strong> ('+ total_km +' km)</td>'+
                 '<td style="float:right;"><strong>' + total_cost + ' €</strong></td></tr>');
    table.append('<tr><td></td><td></td></tr>');
});
         
/*
 * 
 * Page 7 (Route map)
 */
$('#page7').live("pageshow", function() {
    if (!route_points || !route_points.length) {
        $.mobile.changePage($('#page1'), {reverse: true});
        return;
    }
    
    kimppis.drawRoute();
});
        
$('#page7').live("pagecreate", function() {
    $('#route_map_canvas').gmap( { center: common.getLatLng(), 
                                 zoom: 11, 
                                 mapTypeControl: false,
                                 keyboardShortcuts: false,
                                 panControl: false,
                                 rotateControl: false,
                                 scaleControl: false,
                                 streetViewControl: false,
                                 callback: 
        function (map) {
            directionsRenderer = new google.maps.DirectionsRenderer();
            directionsRenderer.setOptions({
                map: map,
                hideRouteList: true
            });
        }
    });
});

var kimppis = {};

kimppis.drawRoute = function() {
    // Get route
    var origin;
    var destination;
    var waypoints = [];
    
    if (settings_finder) {
        origin = kimppis.buildLatLng(route.stand.position);
        destination = kimppis.buildLatLng(route_points[route_points.length-1].request.destination);
        for (var i = 0; i < route_points.length-1; i++) {
            waypoints.push({location: kimppis.buildLatLng(route_points[i].request.destination)});
        }
    } else {
        origin = route_points[0].request.origin;
        destination = route_points[0].request.destination;
    }
    
    var directions_request = {
        origin: origin,
        destination: destination,
        waypoints: waypoints,
        provideRouteAlternatives: false,
        unitSystem: google.maps.UnitSystem.METRIC,
        travelMode: google.maps.TravelMode.DRIVING
    };
                    
    // Show directions
    directionsService.route(directions_request, function(result, status) {
        if (status == google.maps.DirectionsStatus.OK) {
            directionsRenderer.setDirections(result);
        } else {
            console.log(status);
        }
    });
};

/*
*
*	Kimppis-specific code
*/
kimppis.buildLatLng = function(position) {
    return new google.maps.LatLng(position[1], position[0]);
};
        
kimppis.latLngToString = function(latlng, callback) {
    if (!latlng) {
        callback("Unkown");
        return;
    }
            
    var geocoder = new google.maps.Geocoder();
    geocoder.geocode({'latLng': latlng}, function(results, status) {
        if (status == google.maps.GeocoderStatus.OK) {
            if (results[0]) {
                var components = results[0].address_components;
                var hood = "";
                var postal_code = "";
                var city = "";
                for (var i in components) {
                    switch(components[i].types[0]) {
                    case 'postal_code':
                        postal_code = components[i].long_name;
                        hood = common.postalCodeMapping[postal_code];
                        break;
                    case 'administrative_area_level_3':
                        city = components[i].long_name;
                        break;
                    }
                }
                        
                var string =  postal_code + " " + hood + ", " + city;
                callback(string);
            }
        } else {
            console.log("Geocoder failed due to: " + status);
        }
    });
};
        
// Analytics
$('[data-role=page]').live('pageshow', function (event, ui) {
    try {
        _gaq.push(['_setAccount', 'YOUR_GA_ID']);

        hash = location.hash;

        if (hash) {
            _gaq.push(['_trackPageview', hash.substr(1)]);
        } else {
            _gaq.push(['_trackPageview']);
        }
    } catch(err) {
        console.log(err);
    }
});
