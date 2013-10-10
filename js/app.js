
var HOST = 'http://saleiva.cartodb.com/api/v2/sql'
// var SQL = 'select ward, the_geom, array_agg(num_crimes) as values, array_agg(date) as dates from chicago_aggrday group by ward, the_geom'

var SQL = "SELECT array_agg(a.value) as values, array_agg(a.date) as dates, b.the_geom FROM idealista_districts_transposed a, madrid_distritos b WHERE a.distrito = lower(b.nombre02) GROUP BY a.distrito, b.the_geom"

var GEO = HOST + '?q=' + SQL + "&format=topojson"

var FRAME_TIME = 600;

var width = 960,
    height = 640;

var rateById = d3.map();

var projection = d3.geo.mercator()
    .scale(1)
    .translate([0, 0])

var path = d3.geo.path()
    .projection(projection);


var svg = d3.select("body").append("svg")
    .attr("width", width)
    .attr("height", height);

var yearLabel = svg.append("text");
var playInt;

queue()
    .defer(d3.json, GEO)
    .await(ready);

function fitBounds(geojson, projection) {
  var b = path.bounds(geojson),
    s = .95 / Math.max((b[1][0] - b[0][0]) / width, (b[1][1] - b[0][1]) / height),
    t = [(width - s * (b[1][0] + b[0][0])) / 2, (height - s * (b[1][1] + b[0][1])) / 2];

  projection
    .scale(s)
    .translate(t);
}

var BUBBLES = false;
var BUBBLE_TRAILS = false;
var MIN_BUBBLE_SIZE = 4;
var MAX_BUBBLE_SIZE = 30;
var NUM_TICKS = 51;

var c = 0;

function ready(error, geo) {

  var geojson = Object.keys(geo.objects).map(function(g) { return topojson.feature(geo, geo.objects[g]); });
  // create interpolation objects per feature
  // with dates and values  

  var maxValue = Number.MIN_VALUE;
  var minValue = Number.MAX_VALUE;
  var maxDate = Number.MIN_VALUE;
  var minDate = Number.MAX_VALUE;

  for(var i = 0; i < geojson.length; ++i) {
    var g = geojson[i];
    var dates = JSON.parse(
        g.properties.dates
          .replace('{', '[')
          .replace('}', ']')
        ).map(function(d) { return new Date(d.replace(/-/g, '/')); });

    g.properties.val = d3.time.scale().domain(dates).range(g.properties.values).clamp(true);

    var max = d3.max(g.properties.values);
    var min = d3.min(g.properties.values);
    maxValue =  max > maxValue ? max: maxValue;
    minValue =  min < minValue ? min: minValue;

    max = d3.max(dates);
    min = d3.min(dates);
    maxDate =  max > maxDate ? max: maxDate;
    minDate =  min < minDate ? min: minDate;

  }


  yearLabel
    .text('loading...')
    .attr("font-family", "sans-serif")
    .attr("font-size", "20px")
    .attr("x", 100)
    .attr("y", 100);

  geojson = { type: "FeatureCollection", features: geojson };

  // generate color scale based on max min values 
  var colorRange = s = d3.scale.linear()
      .domain([minValue, maxValue])
      .interpolate(d3.interpolateRgb)
      .range(["#FFEDA0", "#ff0000"])

  var bubbleSize = d3.scale.linear()
      .domain([minValue, maxValue])
      .range([MIN_BUBBLE_SIZE, MAX_BUBBLE_SIZE])

  var dateScale = d3.time.scale().domain([minDate, maxDate])


  slider = d3.slider()
    .axis(true)
    .min(minDate.getFullYear())
    .max(maxDate.getFullYear())
    .step(1)
    .on('slide', function(e, value) { 
      _set(value);
    })
    .on('dragstart', function(e){
      clearInterval(playInt);
    })
    .on('dragend', function(e, value){
      _set(value);
      // playInt = setInterval(tick, FRAME_TIME/2);
    })
  d3.select('#slider').call(slider);

  fitBounds(geojson, projection)

  var g = svg.append("g");

  var rangeYears = [];
  for (var i = minDate.getFullYear(); i <= maxDate.getFullYear(); i++) {
    rangeYears.push(i)
  };

  function _set(value){
    var _d =  new Date(value,00,01);
    var _dateTicks = dateScale.ticks(NUM_TICKS/2);
    c = rangeYears.indexOf(value)*4 > 51 ? 51 : rangeYears.indexOf(value)*4;
    console.log(c)
    _update(_d,_dateTicks,c);
  }

  function _update(time, dateTicks, currentTick) {

    slider.value(time.getFullYear());

    var geoms = g.selectAll("path")
        .data(geojson.features)

    geoms.enter().append("path")
        .attr('fill', function(d) { 
          return colorRange(d.properties.val(time));
        })
        .attr("d", path)

    geoms.enter().append("path")
      .attr("class", "lines")
      .attr("d", path);

    geoms.transition().duration(FRAME_TIME).attr('fill', function(d) { 
      return colorRange(d.properties.val(time));
    })

    yearLabel.text(time.getFullYear());

    //
    // bubbles
    //
    if(BUBBLES) {
      function addBubbles(data, _class, time) {
        var bubble = g.selectAll("circle." + _class)
            .data(geojson.features)
        var circle = d3.svg.symbol().type('circle')

        bubble.enter()
          .append("circle")
          .attr('class', _class)
          .attr("r", function(d) { return bubbleSize(d.properties.val(time)); })
          .attr({
            cx: function(d) { 
              return path.centroid(d)[0]; 
            },
            cy: function(d) { return path.centroid(d)[1]; }
          })

        bubble.attr("r", function(d) { return bubbleSize(d.properties.val(time)); })
      }
      addBubbles(geojson.features, 'frame-offset-0', time);
      if (BUBBLE_TRAILS) {
        addBubbles(geojson.features, 'frame-offset-1', dateTicks[currentTick - 1]);
        addBubbles(geojson.features, 'frame-offset-2', dateTicks[currentTick - 2]);
        addBubbles(geojson.features, 'frame-offset-3', dateTicks[currentTick - 3]);
        addBubbles(geojson.features, 'frame-offset-4', dateTicks[currentTick - 4]);
      }
    }

  }

  function tick() {
    var dateTicks = dateScale.ticks(NUM_TICKS);
    var time = dateTicks[c];
    c = (c + 1) % NUM_TICKS;
    _update(time, dateTicks, c);
  }
  tick();
  // playInt = setInterval(tick, FRAME_TIME);
}
