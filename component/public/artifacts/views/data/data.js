if (!nabu) { var nabu = {} }
if (!nabu.page) { nabu.page = {} }
if (!nabu.page.views) { nabu.page.views = {} }
if (!nabu.page.views.data) { nabu.page.views.data = {} }

Vue.component("data-common", {
	template: "#data-common",
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
		},
		records: {
			type: Array,
			required: false,
			default: function() { return [] }
		},
		selected: {
			type: Array,
			required: false,
			default: function() { return [] }
		},
		value: {
			required: true
		},
		updatable: {
			type: Boolean,
			required: false,
			default: false
		},
		multiselect: {
			type: Boolean,
			required: false,
			default: false
		},
		inactive: {
			type: Boolean,
			required: false,
			default: false
		}
	},
	data: function() {
		return {
			paging: {},
			configuring: false,
			actionHovering: false,
			last: null,
			showFilter: false,
			filters: {},
			ready: false,
			subscriptions: [],
			lastTriggered: null,
			query: null,
			// the current order by
			orderBy: [],
			refreshTimer: null
		}	
	},
	created: function() {
		this.normalize(this.cell.state);
		if (!this.inactive) {
			// merge the configured orderby into the actual
			nabu.utils.arrays.merge(this.orderBy, this.cell.state.orderBy);
			
			if (this.cell.state.array) {
				this.loadArray();
			}
			else {
				var self = this;
				this.load().then(function() {
					self.$emit("input", true);
				});
			}
			
			var self = this;
			var pageInstance = self.$services.page.getPageInstance(self.page, self);
			this.cell.state.refreshOn.map(function(x) {
				self.subscriptions.push(pageInstance.subscribe(x, function() {
					self.load();
				}));
			});
		}
	},
	beforeDestroy: function() {
		this.subscriptions.map(function(x) {
			x();
		});
	},
	ready: function() {
		this.ready = true;
		if (this.cell.state.array || this.inactive) {
			this.$emit("input", true);
		}
	},
	computed: {
		filterable: function() {
			return this.cell.state.filters.length;  
		},
		actions: function() {
			return this.cell.state.actions.filter(function(x) {
				return !x.global && x.icon;
			});
		},
		globalActions: function() {
			return this.cell.state.actions.filter(function(x) {
				return x.global && x.label;
			});
		},
		dataClass: function() {
			return this.cell.state.class ? this.cell.state.class : [];        
		},
		operation: function() {
			return this.cell.state.operation ? this.$services.swagger.operations[this.cell.state.operation] : null;
		},
		availableParameters: function() {
			return this.$services.page.getAvailableParameters(this.page, this.cell, true);
		},
		definition: function() {
			var properties = {};
			if (this.operation) {
				var definition = this.$services.swagger.resolve(this.operation.responses["200"].schema);
				//var definition = this.$services.swagger.definition(schema["$ref"]);
				if (definition.properties) {
					var self = this;
					Object.keys(definition.properties).map(function(field) {
						if (definition.properties[field].type == "array") {
							var items = definition.properties[field].items;
							if (items.properties) {
								nabu.utils.objects.merge(properties, items.properties);
							}
						}
					});
				}
			}
			else if (this.cell.state.array) {
				var available = this.$services.page.getAvailableParameters(this.page, this.cell);
				var variable = this.cell.state.array.substring(0, this.cell.state.array.indexOf("."));
				var rest = this.cell.state.array.substring(this.cell.state.array.indexOf(".") + 1);
				if (available[variable]) {
					nabu.utils.objects.merge(properties, this.$services.page.getChildDefinition(available[variable], rest).items.properties);
				}
			}
			return properties;
		},
		hasLimit: function() {
			return !this.operation || !this.operation.parameters ? false : this.operation.parameters.filter(function(x) {
				return x.name == "limit";
			}).length;
		},
		// all the actual parameters (apart from the spec-based ones)
		inputParameters: function() {
			var result = {
				properties: {}
			};
			var self = this;
			if (this.operation && this.operation.parameters) {
				var blacklist = ["limit", "offset", "orderBy", "connectionId"];
				var parameters = this.operation.parameters.filter(function(x) {
					return blacklist.indexOf(x.name) < 0;
				}).map(function(x) {
					result.properties[x.name] = self.$services.swagger.resolve(x);
				})
			}
			return result;
		},
		formInputParameters: function() {
			var result = {
				properties: {}
			};
			if (this.cell.state.updateOperation && this.$services.swagger.operations[this.cell.state.updateOperation]) {
				this.$services.swagger.operations[this.cell.state.updateOperation].parameters.filter(function(x) {
					return x.in != "body";
				}).map(function(parameter) {
					result.properties[parameter.name] = parameter;
				});
			}
			return result;
		},
		formAvailableParameters: function() {
			return {
				record: {
					properties: this.definition
				}
			};
		},
		keys: function() {
			var keys = this.$services.page.getSimpleKeysFor({properties:this.definition});
			var self = this;
			keys.map(function(key) {
				if (!self.cell.state.result[key]) {
					Vue.set(self.cell.state.result, key, {
						label: null,
						format: null,
						custom: null,
						styles: []
					});
				}
			});
			return keys;
		},
		orderable: function() {
			// the operation must have an input parameter called "orderBy"
			return this.operation && this.operation.parameters.filter(function(x) {
				return x.name == "orderBy";
			}).length > 0;
		},
		pageable: function() {
			// the operation must have an input parameter called "orderBy"
			return this.operation && this.operation.parameters.filter(function(x) {
				return x.name == "limit";
			}).length > 0;
		}
	},
	beforeDestroy: function() {
		if (this.refreshTimer) {
			clearTimeout(this.refreshTimer);
			this.refreshTimer = null;
		}	
	},
	methods: {
		getDataOperations: function(value) {
			return this.$services.dataUtils.getDataOperations(value).map(function(x) { return x.id });	
		},
		getSortKey: function(field) {
			for (var i = 0; i < field.fragments.length; i++) {
				var fragment = field.fragments[i];
				if (fragment.type == "data" && fragment.key) {
					return fragment.key;
				}
				else if (fragment.type == "form" && fragment.form.name) {
					return fragment.form.name;
				}
			}
			return null;
		},
		getEvents: function() {
			var self = this;
			var result = {};
			if (this.operation) {
				var schema = this.operation.responses["200"].schema;
				
				// the return is always a singular object
				var definition = this.$services.swagger.resolve(schema).properties;
				var found = false;
				// we are interested in the (complex) array within this object
				Object.keys(definition).map(function(key) {
					if (!found && definition[key].type == "array" && definition[key].items.properties) {
						definition = definition[key].items;
						found = true;
					}
				});
				if (!found) {
					definition = null;
				}
				
				this.cell.state.actions.map(function(action) {
					result[action.name] = action.global && !action.useSelection
						//? (self.cell.on ? self.$services.page.instances[self.page.name].getEvents()[self.cell.on] : [])
						? (self.cell.on ? self.cell.on : {})
						: definition;
				});
			}
			else {
				this.cell.state.actions.map(function(action) {
					result[action.name] = action.global && !action.useSelection
						? (self.cell.on ? self.cell.on : {})
						: {properties:self.definition};
				});
			}
			return result;
		},
		buildToolTip: function(d) {
			if (!this.cell.state.fields.length) {
				return null;
			}
			var self = this;
			var component = Vue.extend({
				template: "<page-fields class='data-field' :cell='cell' :label='true' :page='page' :data='record' :should-style='true' :edit='edit'/>",
				data: function() {
					return {
						cell: self.cell,
						page: self.page,
						record: d,
						edit: self.edit
					}
				}
			});
			return new component();
			var html = "";
			var counter = 0;
			for (var index in this.keys) {
				var key = this.keys[index];
				if (!this.isHidden(key)) {
					html += "<div class='property'><span class='key'>" 
						+ (this.cell.state.result[key].label ? this.cell.state.result[key].label : key) 
						+ "</span><span class='value'>" 
						+ this.interpret(key, d[key], d) + "</span></div>";
				}
			}
			return html;
		},
		getRecordStyles: function(record) {
			var styles = [{'selected': this.selected.indexOf(record) >= 0}];
			nabu.utils.arrays.merge(styles, this.$services.page.getDynamicClasses(this.cell.state.styles, {record:record}));
			return styles;
		},
		addRecordStyle: function() {
			this.cell.state.styles.push({
				class: null,
				condition: null
			});
		},
		addStyle: function(key) {
			if (!this.cell.state.result[key].styles) {
				Vue.set(this.cell.state.result[key], "styles", []);
			}
			this.cell.state.result[key].styles.push({
				class:null,
				condition:null
			});
		},
		// standard methods!
		configure: function() {
			this.configuring = true;	
		},
		refresh: function() {
			this.load();
		},
		// custom methods
		setFilter: function(filter, newValue) {
			Vue.set(this.filters, filter.name, newValue);
			// if we adjusted the filter, do we want to rescind the selection event we may have sent out?
			var self = this;
			var pageInstance = self.$services.page.getPageInstance(self.page, self);
			this.cell.state.actions.map(function(action) {
				if (action.name && pageInstance.get(action.name)) {
					pageInstance.emit(action.name, null);
				}
			})
			this.load();
		},
		setComboFilter: function(value, label) {
			this.setFilter(this.cell.state.filters.filter(function(x) { return x.label == label })[0], value);
		},
		filterCombo: function(value, label) {
			var filter = this.cell.state.filters.filter(function(x) { return x.label == label })[0];
			if (filter.type == 'enumeration') {
				return value ? filter.enumerations.filter(function(x) {
					return x.toLowerCase().indexOf(value.toLowerCase()) >= 0;
				}) : filter.enumerations;
			}
			else {
				this.setComboFilter(value, label);
				return [];
			}
		},
		filtersToAdd: function(ignoreCurrentFilters) {
			var self = this;
			var currentFilters = this.cell.state.filters.map(function(x) {
				return x.name;
			});
			// any input parameters that are not bound
			var result = Object.keys(this.inputParameters.properties);
			if (!ignoreCurrentFilters) {
				result = result.filter(function(key) {
					// must not be bound and not yet a filter
					return !self.cell.bindings[key] && (currentFilters.indexOf(key) < 0 || ignoreCurrentFilters);
				});
			}
			return result;
		},
		addFilter: function() {
			this.cell.state.filters.push({
				field: null,
				label: null,
				type: 'text',
				enumerations: [],
				value: null
			})
		},
		select: function(record) {
			// if you are hovering over an action, you are most likely triggering that, not selecting
			if (!this.actionHovering) {
				if (!this.multiselect || !this.cell.state.multiselect) {
					this.selected.splice(0, this.selected.length);
				}
				var index = this.selected.indexOf(record);
				// if we are adding it, send out an event
				if (index < 0) {
					this.selected.push(record);
					this.trigger(null, record);
				}
				else {
					this.selected.splice(index, 1);
				}
			}
		},
		trigger: function(action, data) {
			if (!action) {
				this.lastTriggered = data;
			}
			// if no action is specified, it is the one without the icon and label (and not global)
			// this is row specific (not global) but does not have an actual presence (no icon & label)
			if (!action && !this.actionHovering) {
				action = this.cell.state.actions.filter(function(x) {
					return !x.icon && !x.label && !x.global;
				})[0];
			}
			if (action) {
				var self = this;
				var pageInstance = self.$services.page.getPageInstance(self.page, self);
				// if there is no data (for a global event) 
				if (action.global) {
					if (action.useSelection) {
						data = this.multiselect && this.cell.state.multiselect && this.selected.length > 1 
							? this.selected
							: (this.selected.length ? this.selected[0] : null);
					}
					else {
						data = this.$services.page.getPageInstance(this.page, this).get(this.cell.on);
					}
					if (!data) {
						data = {};
					}
				}
				if (action.name) {
					return pageInstance.emit(action.name, data).then(function() {
						if (action.refresh) {
							self.load();
						}
						else if (action.close) {
							self.$emit("close");
						}
					});
				}
				else if (action.close) {
					this.$emit("close");
				}
			}
		},
		getFormOperations: function() {
			var self = this;
			return this.$services.page.getOperations(function(operation) {
				// must be a put or post
				return (operation.method.toLowerCase() == "put" || operation.method.toLowerCase() == "post")
					// and contain the name fragment (if any)
					&& (!name || operation.id.toLowerCase().indexOf(name.toLowerCase()) >= 0);
			}).map(function(x) { return x.id });
		},
		normalize: function(state) {
			/*if (!state.transform) {
				Vue.set(state, "transform", null);
			}*/
			if (!state.autoRefresh) {
				Vue.set(state, "autoRefresh", null);
			}
			if (!state.orderBy) {
				Vue.set(state, "orderBy", []);
			}
			if (!state.filterPlaceHolder) {
				Vue.set(state, "filterPlaceHolder", null);
			}
			if (!state.filterType) {
				Vue.set(state, "filterType", null);
			}
			if (!state.title) {
				Vue.set(state, "title", null);
			}
			if (!state.limit) {
				Vue.set(state, "limit", 20);
			}
			// actions you can perform on a single row
			if (!state.actions) {
				Vue.set(state, "actions", []);
			}
			if (!state.filters) {
				Vue.set(state, "filters", []);
			}
			if (!state.fields) {
				Vue.set(state, "fields", []);
			}
			if (!state.updateOperation) {
				Vue.set(state, "updateOperation", null);
			}
			if (!state.updateBindings) {
				Vue.set(state, "updateBindings", {});
			}
			if (!state.multiselect) {
				Vue.set(state, "multiselect", false);
			}
			if (!state.styles) {
				Vue.set(state, "styles", []);
			}
			if (!state.refreshOn) {
				Vue.set(state, "refreshOn", []);
			}
			else {
				var self = this;
				state.filters.map(function(x) {
					Vue.set(self.filters, x.field, null);
				});
			}
			if (!state.showRefresh) {
				Vue.set(state, "showRefresh", false);
			}
			// we add a result entry for each field
			// we can then set formatters for each field
			if (!state.result) {
				Vue.set(state, "result", {});
			}
			Object.keys(this.definition).map(function(key) {
				if (!state.result[key]) {
					Vue.set(state.result, key, {
						label: null,
						format: null,
						custom: null,
						styles: []
					});
				}
			});
			var self = this;
			Object.keys(this.inputParameters).map(function(x) {
				if (!self.cell.bindings[x]) {
					Vue.set(self.cell.bindings, x, null);
				}
			});
		},
		removeAction: function(action) {
			var index = this.cell.state.actions.indexOf(action);
			if (index >= 0) {
				this.cell.state.actions.splice(index, 1);
			}
		},
		getDynamicClasses: function(key, record) {
			// the old way
			if (typeof(key) == "string") {
				var styles = this.cell.state.result[key].styles;
				if (styles) {
					var self = this;
					return styles.filter(function(style) {
						return self.isCondition(style.condition, record);
					}).map(function(style) {
						return style.class;
					});
				}
				else {
					return [];
				}
			}
			else {
				
			}
		},
		isCondition: function(condition, record) {
			var state = {
				record: record	
			}
			var result = eval(condition);
			if (result instanceof Function) {
				result = result(state);
			}
			return result == true;
		},
		addAction: function() {
			this.cell.state.actions.push({
				name: "unnamed",
				icon: null,
				class: null,
				label: null,
				condition: null,
				refresh: false,
				global: false,
				close: false,
				type: "button",
				useSelection: false
			});
		},
		upAction: function(action) {
			var index = this.cell.state.actions.indexOf(action);
			if (index > 0) {
				var replacement = this.cell.state.actions[index - 1];
				this.cell.state.actions.splice(index - 1, 1, action);
				this.cell.state.actions.splice(index, 1, replacement);
			}
		},
		downAction: function(action) {
			var index = this.cell.state.actions.indexOf(action);
			if (index < this.cell.state.length - 1) {
				var replacement = this.cell.state.actions[index + 1];
				this.cell.state.actions.splice(index + 1, 1, action);
				this.cell.state.actions.splice(index, 1, replacement);
			}
		},
		sort: function(key) {
			if (key) {
				if (this.orderable) {
					var newOrderBy = [];
					if (this.orderBy.indexOf(key) >= 0) {
						newOrderBy.push(key + " desc");
					}
					else if (this.orderBy.indexOf(key + " desc") >= 0) {
						// do nothing, we want to remove the filter
					}
					else {
						newOrderBy.push(key);
					}
					this.orderBy.splice(0, this.orderBy.length);
					nabu.utils.arrays.merge(this.orderBy, newOrderBy);
					if (this.edit) {
						this.cell.state.orderBy.splice(0, this.cell.state.orderBy.length);
						nabu.utils.arrays.merge(this.cell.state.orderBy, this.orderBy);
					}
					this.load();
				}
				// do a frontend sort (can't do it if paged)
				else if (this.cell.state.array || !this.pageable) {
					var newOrderBy = [];
					var multiplier = 1;
					if (this.orderBy.indexOf(key) >= 0) {
						newOrderBy.push(key + " desc");
						multiplier = -1;
					}
					else if (this.orderBy.indexOf(key + " desc") >= 0) {
						// do nothing, we want to remove the filter
					}
					else {
						newOrderBy.push(key);
					}
					this.orderBy.splice(0, this.orderBy.length);
					nabu.utils.arrays.merge(this.orderBy, newOrderBy);
					if (this.edit) {
						this.cell.state.orderBy.splice(0, this.cell.state.orderBy.length);
						nabu.utils.arrays.merge(this.cell.state.orderBy, this.orderBy);
					}
					if (newOrderBy.length) {
						this.internalSort(key, multiplier);
					}
				}
			}
		},
		internalSort: function(key, multiplier) {
			this.records.sort(function(a, b) {
				var valueA = a[key];
				var valueB = b[key];
				var result = 0;
				if (!valueA && valueB) {
					result = -1;
				}
				else if (valueA && !valueB) {
					result = 1;
				}
				else if (valueA instanceof Date && valueB instanceof Date) {
					result = valueA.getTime() - valueB.getTime();
				}
				else if (typeof(valueA) == "string" || typeof(valueB) == "string") {
					result = valueA.localeCompare(valueB);
				}
				return result * multiplier;
			});
		},
		updateFormOperation: function(operationId) {
			if (this.cell.state["updateOperation"] != operationId) {
				Vue.set(this.cell.state, "updateOperation", operationId);
				var operation = this.$services.swagger.operations[operationId];
				var bindings = {};
				var self = this;
				if (operation.parameters) {
					operation.parameters.map(function(parameter) {
						bindings[parameter.name] = self.cell.state.updateBindings && self.cell.state.updateBindings[parameter.name]
							? self.cell.state.updateBindings[parameter.name]
							: null;
					});
					Vue.set(this.cell.state, "updateBindings", bindings);
				}
			}
		},
		updateArray: function(array) {
			Vue.set(this.cell.state, "array", array);
			Vue.set(this.cell, "bindings", {});
			Vue.set(this.cell, "result", {});
			var self = this;
			if (array) {
				this.$confirm({
					message: "(Re)generate fields?"
				}).then(function() {
					// we clear out the fields, they are most likely useless with another operation
					self.cell.state.fields.splice(0, self.cell.state.fields.length);
					// instead we add entries for all the fields in the return value
					self.keys.map(function(key) {
						self.cell.state.fields.push({
							label: key,
							fragments: [{
								type: "data",
								key: key
							}]
						});
					});
				});
			}
			this.loadArray();
		},
		loadArray: function() {
			if (this.cell.state.array) {
				var current = this.$services.page.getPageInstance(this.page, this).get(this.cell.state.array);
				if (current) {
					this.records.splice(0, this.records.length);
					nabu.utils.arrays.merge(this.records, current);
				}
				this.doInternalSort();
			}
		},
		doInternalSort: function() {
			if (this.orderBy && this.orderBy.length) {
				var field = this.cell.state.orderBy[0];
				var index = field.indexOf(" desc");
				var multiplier = 1;
				if (index >= 0) {
					multiplier = -1;
					field = field.substring(0, index);
				}
				this.internalSort(field, multiplier);
			}
		},
		updateOperation: function(operationId) {
			if (this.cell.state["operation"] != operationId) {
				var operation = this.$services.swagger.operations[operationId];
				Vue.set(this.cell.state, "operation", operationId);
				var bindings = {};
				var self = this;
				if (operation.parameters) {
					operation.parameters.map(function(parameter) {
						bindings[parameter.name] = self.cell.bindings && self.cell.bindings[parameter.name]
							? self.cell.bindings[parameter.name]
							: null;
					});
				}
				// TODO: is it OK that we simply remove all bindings?
				// is the table the only one who sets bindings here?
				Vue.set(this.cell, "bindings", bindings);
				
				Vue.set(this.cell, "result", {});
				
				if (operationId) {
					this.$confirm({
						message: "(Re)generate fields?"
					}).then(function() {
						// we clear out the fields, they are most likely useless with another operation
						self.cell.state.fields.splice(0, self.cell.state.fields.length);
						// instead we add entries for all the fields in the return value
						self.keys.map(function(key) {
							self.cell.state.fields.push({
								label: key,
								fragments: [{
									type: "data",
									key: key
								}]
							});
						});
					})
				}
				// if there are no parameters required, do an initial load
				if (!operation.parameters.filter(function(x) { return x.required }).length) {
					this.load();
				}
			}
		},
		update: function(record) {
			var parameters = {};
			var self = this;
			Object.keys(this.cell.state.updateBindings).map(function(key) {
				if (self.cell.state.updateBindings[key]) {
					parameters[key] = record[self.cell.state.updateBindings[key].substring("record.".length)];
				}
			});
			parameters.body = record;
			return this.$services.swagger.execute(this.cell.state.updateOperation, parameters);
		},
		isHidden: function(key) {
			return this.cell.state.result[key] && this.cell.state.result[key].format == "hidden";	
		},
		interpret: function(key, value, record) {
			if (value) {
				var format = this.cell.state.result[key] ? this.cell.state.result[key].format : null;
				if (format == "link") {
					if (value.indexOf("http://") == 0 || value.indexOf("https://") == 0) {
						return "<a target='_blank' href='" + value + "'>" + value.replace(/http[s]*:\/\/([^/]+).*/, "$1") + "</a>";
					}
				}
				else if (format == "dateTime") {
					value = new Date(value).toLocaleString();
				}
				else if (format == "date") {
					value = new Date(value).toLocaleDateString();
				}
				else if (format == "time") {
					value = new Date(value).toLocaleTimeString();
				}
				else if (format == "masterdata") {
					value = this.$services.masterdata.resolve(value);
				}
				else if (format == "custom") {
					value = this.formatCustom(key, value, record);
				}
				else if (typeof(value) == "string") {
					value = value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
						.replace(/\n/g, "<br/>").replace(/\t/g, "&nbsp;&nbsp;&nbsp;&nbsp;");
				}
			}
			return value;
		},
		formatCustom: function(key, value, record) {
			var state = {
				record: record
			}
			if (this.cell.state.result[key].custom) {
				try {
					var result = eval(this.cell.state.result[key].custom);
					if (result instanceof Function) {
						result = result(key, value, state);	
					}
					return result;
				}
				catch (exception) {
					return exception.message;
				}
			}
		},
		load: function(page) {
			if (this.refreshTimer) {
				clearTimeout(this.refreshTimer);
				this.refreshTimer = null;
			}
			var promise = this.$services.q.defer();
			if (this.cell.state.operation) {
				var self = this;
				var parameters = {};
				if (this.orderable && this.orderBy.length) {
					parameters.orderBy = this.orderBy;
				}
				
				// we put a best effort limit & offset on there, but the operation might not support it
				// at this point the parameter is simply ignored
				var limit = this.cell.state.limit ? parseInt(this.cell.state.limit) : 20;
				parameters.offset = (page ? page : 0) * limit;
				parameters.limit = limit;
				
				var pageInstance = self.$services.page.getPageInstance(self.page, self);
				// bind additional stuff from the page
				Object.keys(this.cell.bindings).map(function(name) {
					if (self.cell.bindings[name]) {
						var value = self.$services.page.getBindingValue(pageInstance, self.cell.bindings[name]);
						if (value != null && typeof(value) != "undefined") {
							parameters[name] = value;
						}
					}
				});
				this.cell.state.filters.map(function(filter) {
					parameters[filter.name] = filter.type == 'fixed' ? filter.value : self.filters[filter.name];	
				});
				try {
					this.$services.swagger.execute(this.cell.state.operation, parameters).then(function(list) {
						self.records.splice(0, self.records.length);
						Object.keys(list).map(function(field) {
							if (list[field] instanceof Array && !self.records.length) {
								nabu.utils.arrays.merge(self.records, list[field]);
							}
						});
						if (list.page) {
							nabu.utils.objects.merge(self.paging, list.page);
						}
						else {
							self.doInternalSort();
						}
						self.last = new Date();
						if (self.cell.state.autoRefresh) {
							self.refreshTimer = setTimeout(function() {
								self.load(page);
							}, self.cell.state.autoRefresh);
						}
						promise.resolve();
					}, function(error) {
						promise.resolve(error);
					});
				}
				catch(error) {
					console.warn("Could not run", this.cell.state.operation, error);
					promise.resolve(error);
				}
			}
			else {
				promise.resolve("No operation found");
			}
			return promise;
		}
	}
});