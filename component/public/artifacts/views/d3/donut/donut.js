if (!nabu) { var nabu = {} };
if (!nabu.views) { nabu.views = {} };
if (!nabu.views.dashboard) { nabu.views.dashboard = {} };

nabu.views.dashboard.Donut = Vue.extend({
	template: "#dashboard-donut",
	props: {
		page: {
			type: Object,
			required: true
		},
		parameters: {
			type: Object,
			required: false
		},
		cell: {
			type: Object,
			required: true
		},
		edit: {
			type: Boolean,
			required: true
		}
	},
	data: function() {
		return {
			records: [],
			loaded: false
		}
	},
	created: function() {
		this.normalize(this.cell.state);
	},
	computed: {
		events: function() {
			return this.$refs.data ? this.$refs.data.events : {};
		},
		fromColor: function() {
			return this.cell.state.fromColor ? this.cell.state.fromColor : "darkred";
		},
		toColor: function() {
			return this.cell.state.toColor ? this.cell.state.toColor : "darkolivegreen";
		},
		arcWidth: function() {
			return this.cell.state.arcWidth ? this.cell.state.arcWidth / 100 : 0.1;
		}
	},
	ready: function() {
		this.draw();		
	},
	methods: {
		draw: function() {
			var self = this;
			if (this.cell.state.value && this.$refs.svg) {
				var records = this.records.filter(function(record) {
					return !!record[self.cell.state.value];
				});
				
				var midAngle = function(d) { return d.startAngle + (d.endAngle - d.startAngle) / 2; }
				// the gap between the slices
				var padAngle = 0.015;
				
				// the border radius of the slices
				var cornerRadius = 3;
				
				var margin = {top: 10, right: 10, bottom: 10, left: 10};
				
				// default color scheme
				var colour = d3.scaleOrdinal(d3.schemeCategory20c);
				
				var color = d3.scaleLinear()
					.domain([0, records.length])
					.range([this.fromColor, this.toColor])
					.interpolate(d3.interpolateHcl);

				// remove previous drawing (if any)
				nabu.utils.elements.clear(this.$refs.svg);
				
				var svg = d3.select(this.$refs.svg),
					width = this.$el.offsetWidth,
					// reserve some space for title etc
					height = this.$el.offsetHeight - (self.cell.state.title ? 50 : 0),
					radius = Math.min(width, height) / 2;
					
				svg.attr('width', width + margin.left + margin.right)
					.attr('height', height + margin.top + margin.bottom);
					
				var pie = d3.pie()
					.sort(null)
					.value(function(record) { return record[self.cell.state.value]; });
					
				var outerFactor = 0.8;
				var innerFactor = outerFactor - (outerFactor * this.arcWidth);
				
				// inner arc for values
				var arc = d3.arc()
					.outerRadius(radius * outerFactor)
					.innerRadius(radius * innerFactor)
					.cornerRadius(cornerRadius)
					.padAngle(padAngle);
					
				// this arc is used for aligning the text labels
				var outerArc = d3.arc()
					.outerRadius(radius * 0.9)
					.innerRadius(radius * 0.9);
					
				var toolTipHTML = function(d) {
					var html = "";
					var counter = 0;
					for (var index in self.$refs.data.keys) {
						var key = self.$refs.data.keys[index];
						if (!self.$refs.data.isHidden(key)) {
							html += "<tspan x='0'" + (counter++ == 0 ? "" : " dy='1.2rem' ") 
								+ "class='property'><tspan class='key'>" 
								+ (self.cell.state.result[key].label ? self.cell.state.result[key].label : key) 
								+ ": </tspan><tspan class='value'>" 
								+ self.$refs.data.interpret(key, d.data[key]) + "</tspan></tspan>";
						}
					}
					return html;
				}
				
				var toolTip = function(selection) {
					// add tooltip (svg circle element) when mouse enters label or slice
					selection.on('mouseenter', function (data, i) {
						var useFull = innerFactor > 0.4;
						
						// if the inner radius becomes too small, we can't really display text on it, switch to a solid
						var circleRadius = !useFull ? radius * 0.5 :  radius * (innerFactor * 0.95);
						
						svg.append('circle')
							.attr('class', 'toolCircle')
							.attr('r', circleRadius) // radius of tooltip circle
							.style('fill', !useFull ? "#fff" : color(i)) // colour based on category mouse is over
							.style('fill-opacity', !useFull ? 0.9 : 0.35)
							.attr('transform', 'translate(' + width / 2 + ',' + height / 2 + ')');
							
						svg.append('text')
							.attr('class', 'toolCircle')
							.attr('dy', -15) // hard-coded. can adjust this to adjust text vertical alignment in tooltip
							.html(toolTipHTML(data)) // add text to the circle.
							.style('font-size', '.9em')
							.style('text-anchor', 'middle')
							.attr('transform', 'translate(' + width / 2 + ',' + height / 2 + ')'); // centres text in tooltip
					});
						
					// remove the tooltip when mouse leaves the slice/label
					selection.on('mouseout', function () {
						d3.selectAll('.toolCircle').remove();
					});
				}
					
				// separate elements to keep things modular
				svg.append('g').attr('class', 'slices')
					.attr('transform', 'translate(' + width / 2 + ',' + height / 2 + ')');
				svg.append('g').attr('class', 'labelName')
					.attr('transform', 'translate(' + width / 2 + ',' + height / 2 + ')');
				svg.append('g').attr('class', 'lines')
					.attr('transform', 'translate(' + width / 2 + ',' + height / 2 + ')');
				
				// add and color the slices
				var path = svg.select('.slices')
					.datum(records).selectAll("path")
					.data(pie)
					.enter().append("path")
					.attr('fill', function(d, i) { return color(i); return colour(d.data[self.cell.state.label ? self.cell.state.label : self.cell.state.value]); })
					.attr('d', arc);
					
				// add labels
				var label = svg.select('.labelName')
					.datum(records).selectAll("text")
					.data(pie)
					.enter().append('text')
					.attr('dy', '.35em')
					.html(function(d) {
						var value = "";
						if (self.cell.state.label) {
							value = d.data[self.cell.state.label];
						}
						else {
							value = d.data[self.cell.state.value];
						}
						return value + (self.cell.state.unit ? "<tspan>" + self.cell.state.unit + "</tspan>" : "");
					})
					.attr('transform', function(d) {
						// effectively computes the centre of the slice.
						// see https://github.com/d3/d3-shape/blob/master/README.md#arc_centroid
						var pos = outerArc.centroid(d);
						
						// changes the point to be on left or right depending on where label is.
						pos[0] = radius * 0.95 * (midAngle(d) < Math.PI ? 1 : -1);
						return 'translate(' + pos + ')';
					})
					.style('text-anchor', function(d) {
						// if slice centre is on the left, anchor text to start, otherwise anchor to end
						return (midAngle(d)) < Math.PI ? 'start' : 'end';
					});
					
// add lines connecting labels to slice. A polyline creates straight lines connecting several points
				var polyline = svg.select('.lines')
					.datum(records).selectAll('polyline')
					.data(pie)
					.enter().append('polyline')
					.attr('points', function(d) {
						// see label transform function for explanations of these three lines.
						var pos = outerArc.centroid(d);
						pos[0] = radius * 0.95 * (midAngle(d) < Math.PI ? 1 : -1);
						return [arc.centroid(d), outerArc.centroid(d), pos]
				});
				
				d3.selectAll('.labelName text, .slices path').call(toolTip);
			}
		},
		normalize: function(state) {
			if (!state.value) {
				Vue.set(state, "value", null);
			}
			if (!state.label) {
				Vue.set(state, "label", null);
			}
			if (!state.unit) {
				Vue.set(state, "unit", null);
			}
			if (!state.fromColor) {
				Vue.set(state, "fromColor", null);
			}
			if (!state.toColor) {
				Vue.set(state, "toColor", null);
			}
			if (!state.arcWidth) {
				Vue.set(state, "arcWidth", 30);
			}
		},
		// standard methods!
		configure: function() {
			this.$refs.data.configuring = true;	
		},
		refresh: function() {
			this.$refs.data.load();
		}
	},
	watch: {
		records: function(newValue) {
			if (this.loaded) {
				this.draw();
			}
		}
	}
});