function OmekaMap(mapDivId, center, options) {
    this.mapDivId = mapDivId;
    this.center = center;
    this.options = options;
}

OmekaMap.prototype = {

    map: null,
    mapDivId: null,
    markers: [],
    options: {},
    center: null,
    markerBounds: null,
    mapOverlay: null,

    addMarker: function (lat, lng, options, bindHtml, overlay)
    {
        if (!options) {
            options = {};
        }
        options.position = new google.maps.LatLng(lat, lng);
        options.map = this.map;
        options.overlay = overlay;

        var marker = new google.maps.Marker(options);

        if (bindHtml) {
            var infoWindow = new google.maps.InfoWindow({
                content: bindHtml
            });

            var that = this;
            google.maps.event.addListener(marker, 'click', function () {
                // Prevent multiple windows from being open at once.
                if (that.lastWindow) {
                    that.lastWindow.close();
                }
                that.lastWindow = infoWindow;
                infoWindow.open(this.map, marker);
                jQuery("#geolocation-overlay").val(overlay).change();
            });
        }

        this.markers.push(marker);
        this.markerBounds.extend(options.position);
        return marker;
    },

    fitMarkers: function () {
        if (this.markers.length == 1) {
            this.map.setCenter(this.markers[0].getPosition());
        } else {
            this.map.fitBounds(this.markerBounds);
        }
    },

    initMap: function () {
        if (!this.center) {
            alert(errNoCenterMap);
            return;
        }

        // Build the map.
        var mapOptions = {
            zoom: this.center.zoomLevel,
            center: new google.maps.LatLng(this.center.latitude, this.center.longitude),
        };

        switch (this.options.mapType) {
        case 'hybrid':
            mapOptions.mapTypeId = google.maps.MapTypeId.HYBRID;
            break;
        case 'satellite':
            mapOptions.mapTypeId = google.maps.MapTypeId.SATELLITE;
            break;
        case 'terrain':
            mapOptions.mapTypeId = google.maps.MapTypeId.TERRAIN;
            break;
        case 'roadmap':
        default:
            mapOptions.mapTypeId = google.maps.MapTypeId.ROADMAP;
        }

        jQuery.extend(mapOptions, this.options.mapOptions);

        this.map = new google.maps.Map(document.getElementById(this.mapDivId), mapOptions);
        this.markerBounds = new google.maps.LatLngBounds();

        mapSelOverlay(this.options["overlay"], this.map);
        var that = this;
        jQuery("#geoloc_ovl_options").ready(function() {
          initSlider();
          jQuery('#geolocation-overlay').change( function() {
            mapSelOverlay(this.value, that.map);
          });
        });

        // Show the center marker if we have that enabled.
        if (this.center.show) {
            this.addMarker(this.center.latitude,
                           this.center.longitude,
                           {title: "(" + this.center.latitude + ',' + this.center.longitude + ")"},
                           this.center.markerHtml);
        }
    }
};

function OmekaMapBrowse(mapDivId, center, options) {
    var omekaMap = new OmekaMap(mapDivId, center, options);
    jQuery.extend(true, this, omekaMap);
    this.initMap();

    //XML loads asynchronously, so need to call for further config only after it has executed
    this.loadKmlIntoMap(this.options.uri, this.options.params);
}

OmekaMapBrowse.prototype = {

    mapOverlay: null,

    afterLoadItems: function () {
        if (this.options.fitMarkers) {
            this.fitMarkers();
        }

        if (!this.options.list) {
            return;
        }
        var listDiv = jQuery('#' + this.options.list);

        if (!listDiv.size()) {
            alert(errMapDiv);
        } else {
            //Create HTML links for each of the markers
            this.buildListLinks(listDiv);
        }

        initSlider();
        var that = this;
        jQuery('#geolocation-overlay').change( function() {
          mapSelOverlay(this.value, that.map);
        });

    },

    /* Need to parse KML manually b/c Google Maps API cannot access the KML
       behind the admin interface */
    loadKmlIntoMap: function (kmlUrl, params) {
        var that = this;
        jQuery.ajax({
            type: 'GET',
            dataType: 'xml',
            url: kmlUrl,
            data: params,
            success: function(data) {
                var xml = jQuery(data);

                /* KML can be parsed as:
                    kml - root element
                        Placemark
                            namewithlink
                            description
                            Point - longitude,latitude
                */
                var placeMarks = xml.find('Placemark');

                // If we have some placemarks, load them
                if (placeMarks.size()) {
                    // Retrieve the balloon styling from the KML file
                    that.browseBalloon = that.getBalloonStyling(xml);

                    // Build the markers from the placemarks
                    jQuery.each(placeMarks, function (index, placeMark) {
                        placeMark = jQuery(placeMark);
                        that.buildMarkerFromPlacemark(placeMark);
                    });

                    // We have successfully loaded some map points, so continue setting up the map object
                    return that.afterLoadItems();
                } else {
                    // @todo Elaborate with an error message
                    return false;
                }
            }
        });
    },

    getBalloonStyling: function (xml) {
        return xml.find('BalloonStyle text').text();
    },

    // Build a marker given the KML XML Placemark data
    // I wish we could use the KML file directly, but it's behind the admin interface so no go
    buildMarkerFromPlacemark: function (placeMark) {
        // Get the info for each location on the map
        var title = placeMark.find('name').text();
        var titleWithLink = placeMark.find('namewithlink').text();
        var body = placeMark.find('description').text();
        var snippet = placeMark.find('Snippet').text();

        // Extract the lat/long from the KML-formatted data
        var coordinates = placeMark.find('Point coordinates').text().split(',');
        var longitude = coordinates[0];
        var latitude = coordinates[1];

        // Extract overlay - to be able to select overlay upon clicking placemark
        var overlay = placeMark.find('overlay').text();

        // Use the KML formatting (do some string sub magic)
        var balloon = this.browseBalloon;
        balloon = balloon.replace('$[namewithlink]', titleWithLink).replace('$[description]', body).replace('$[Snippet]', snippet);

        // Build a marker, add HTML for it
        this.addMarker(latitude, longitude, {title: title}, balloon, overlay);
    },

    // Calculate the zoom level given the 'range' value
    // Not currently used by this class, but possibly useful
    // http://throwless.wordpress.com/2008/02/23/gmap-geocoding-zoom-level-and-accuracy/
    calculateZoom: function (range, width, height) {
        var zoom = 18 - Math.log(3.3 * range / Math.sqrt(width * width + height * height)) / Math.log(2);
        return zoom;
    },

    buildListLinks: function (container) {
        var that = this;
        var list = jQuery('<ul></ul>');
        list.appendTo(container);

        // Loop through all the markers
        jQuery.each(this.markers, function (index, marker) {
            var listElement = jQuery('<li></li>');

            // Make an <a> tag, give it a class for styling
            var link = jQuery('<a></a>');
            link.addClass('item-link');

            // Links open up the markers on the map, clicking them doesn't actually go anywhere
            link.attr('href', 'javascript:void(0);');

            // Each <li> starts with the title of the item
            link.html(marker.getTitle());

            // Clicking the link should take us to the map
            link.bind('click', {}, function (event) {
                google.maps.event.trigger(marker, 'click');
                that.map.panTo(marker.getPosition());
            });

            link.appendTo(listElement);
            listElement.appendTo(list);
        });
    }
};

function OmekaMapSingle(mapDivId, center, options) {
    var omekaMap = new OmekaMap(mapDivId, center, options);
    jQuery.extend(true, this, omekaMap);
    this.initMap();
}

function OmekaMapForm(mapDivId, center, options) {
    var that = this;
    var omekaMap = new OmekaMap(mapDivId, center, options);
    jQuery.extend(true, this, omekaMap);
    this.initMap();

    this.formDiv = jQuery('#' + this.options.form.id);

    // Make the map clickable to add a location point.
    google.maps.event.addListener(this.map, 'click', function (event) {
        // If we are clicking a new spot on the map
        if (!that.options.confirmLocationChange || that.markers.length === 0 || confirm(mapClickConfirm)) {
            var point = event.latLng;
            var marker = that.setMarker(point);
            jQuery('#geolocation_address').val('');
        }
    });

    // Make the map update on zoom changes.
    google.maps.event.addListener(this.map, 'zoom_changed', function () {
        that.updateZoomForm();
    });

    // Make the Find By Address button lookup the geocode of an address and add a marker.
    jQuery('#geolocation_find_location_by_address').bind('click', function (event) {
        var address = jQuery('#geolocation_address').val();
        that.findAddress(address);

        //Don't submit the form
        event.stopPropagation();
        return false;
    });

    // Make the return key in the geolocation address input box click the button to find the address.
    jQuery('#geolocation_address').bind('keydown', function (event) {
        if (event.which == 13) {
            jQuery('#geolocation_find_location_by_address').click();
            event.stopPropagation();
            return false;
        }
    });

    // Make the Update Map Pointer button transfer the lat/lng data to the map and add a marker
    jQuery('#geolocation_update_map_from_coords').bind('click', function (event) {
        var latElement = document.getElementsByName('geolocation[latitude]')[0];
        var lngElement = document.getElementsByName('geolocation[longitude]')[0];
        var address = latElement.value + "," + lngElement.value;
        that.findAddress(address);

        //Don't submit the form
        event.stopPropagation();
        return false;
    });

    jQuery('#geolocation-overlay').change( function() {
      var overlayIdx= this.value;
      that.selOverlay(overlayIdx);
    });

    // Add the existing map point.
    if (this.options.point) {
        this.map.setZoom(this.options.point.zoomLevel);

        var point = new google.maps.LatLng(this.options.point.latitude, this.options.point.longitude);
        var marker = this.setMarker(point);
        this.map.setCenter(marker.getPosition());
    }
}

OmekaMapForm.prototype = {
    mapOverlay: null,

    /* Get the geolocation of the address and add marker. */
    findAddress: function (address) {
        var that = this;
        if (!this.geocoder) {
            this.geocoder = new google.maps.Geocoder();
        }
        this.geocoder.geocode({'address': address}, function (results, status) {
            // If the point was found, then put the marker on that spot
            if (status == google.maps.GeocoderStatus.OK) {
                var point = results[0].geometry.location;

                // If required, ask the user if they want to add a marker to the geolocation point of the address.
                // If so, add the marker, otherwise clear the address.
                if (!that.options.confirmLocationChange || that.markers.length === 0 || confirm(mapClickConfirm)) {
                    var marker = that.setMarker(point);
                } else {
                    jQuery('#geolocation_address').val('');
                    jQuery('#geolocation_address').focus();
                }
            } else {
                // If no point was found, give us an alert
                alert(errAddrNotFound.replace("%s", address));
                return null;
            }
        });
    },

    /* Set the marker to the point. */
    setMarker: function (point) {
        var that = this;

        // Get rid of existing markers.
        this.clearForm();

        // Add the marker
        var marker = this.addMarker(point.lat(), point.lng());
        marker.setAnimation(google.maps.Animation.DROP);

        // Pan the map to the marker
        that.map.panTo(point);

        //  Make the marker clear the form if clicked.
        google.maps.event.addListener(marker, 'click', function (event) {
            if (!that.options.confirmLocationChange || confirm(mapClickConfirm)) {
                that.clearForm();
            }
        });

        this.updateForm(point);
        return marker;
    },

    /* Update the latitude, longitude, and zoom of the form. */
    updateForm: function (point) {
        var latElement = document.getElementsByName('geolocation[latitude]')[0];
        var lngElement = document.getElementsByName('geolocation[longitude]')[0];
        var zoomElement = document.getElementsByName('geolocation[zoom_level]')[0];

        // If we passed a point, then set the form to that. If there is no point, clear the form
        if (point) {
            latElement.value = point.lat();
            lngElement.value = point.lng();
            zoomElement.value = this.map.getZoom();
        } else {
            latElement.value = '';
            lngElement.value = '';
            zoomElement.value = this.map.getZoom();
        }
    },

    /* Update the zoom input of the form to be the current zoom on the map. */
    updateZoomForm: function () {
        var zoomElement = document.getElementsByName('geolocation[zoom_level]')[0];
        zoomElement.value = this.map.getZoom();
    },

    /* Clear the form of all markers. */
    clearForm: function () {
        // Remove the markers from the map
        for (var i = 0; i < this.markers.length; i++) {
            this.markers[i].setMap(null);
        }

        // Clear the markers array
        this.markers = [];

        // Update the form
        this.updateForm();
    },

    /* Resize the map and center it on the first marker. */
    resize: function () {
        google.maps.event.trigger(this.map, 'resize');
        var point;
        if (this.markers.length) {
            var marker = this.markers[0];
            point = marker.getPosition();
        } else {
            point = new google.maps.LatLng(this.center.latitude, this.center.longitude);
        }
        this.map.setCenter(point);
    },

    selOverlay: function(overlayIdx) {
      if ( mapSelOverlay(overlayIdx, this.map) ) {
        var that = this;
        google.maps.event.addListener(mapOverlay, 'click', function (event) {
          if (!that.options.confirmLocationChange || that.markers.length === 0 || confirm(mapClickConfirm)) {
              var point = event.latLng;
              var marker = that.setMarker(point);
              jQuery('#geolocation_address').val('');
          }
        } );
      }
    },

};

function mapSelOverlay(overlayIdx, map) {
  var done = false;

  if (typeof mapOverlay != 'undefined') { mapOverlay.setMap(null); }
  if ( (overlayIdx>=0) && (typeof mapOverlays[overlayIdx] != 'undefined') ) {
    var overlayData = mapOverlays[overlayIdx];
    var imageBounds = {
      north: parseFloat(overlayData["latNorth"]),
      south: parseFloat(overlayData["latSouth"]),
      west:  parseFloat(overlayData["lngWest"]),
      east:  parseFloat(overlayData["lngEast"])
    };
    mapOverlay = new google.maps.GroundOverlay( overlayData["imgUrl"], imageBounds);
    mapOverlay.setMap(map);
    done = true;
  }

  if (jQuery("#ovlOpacSlider").hasClass("ui-slider")) {
    jQuery("#ovlOpacSlider").slider("value", 100);
  }

  return done;
}

function initSlider() {
  jQuery("#ovlOpacSlider").slider({
    min: 0,
    max: 100,
    slide: mapSetOverlayOpacity,
    change: mapSetOverlayOpacity
  })
  .slider("value", 100);
}

function mapSetOverlayOpacity() {
  var sliderPerc = jQuery("#ovlOpacSlider").slider("value");
  if (typeof mapOverlay != 'undefined') {
    mapOverlay.setOpacity(sliderPerc / 100);
  }
}
