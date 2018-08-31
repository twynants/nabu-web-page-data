<template id="data-line">
	<div class="data-cell data-line">
		<data-common-header :page="page" :parameters="parameters" :cell="cell" :edit="edit"
				:records="records"
				@updatedEvents="$emit('updatedEvents')"
				:configuring="configuring"
				@close="$emit('close'); configuring=false"
				:paging="paging">
			<n-form-section slot="main-settings">
				<n-form-text v-model="cell.state.unit" label="Unit" :timeout="600" @input="draw" />
				<n-form-text v-model="cell.state.fromColor" type="color" :label="cell.state.z ? 'From Color' : 'Color'" :timeout="600" @input="draw" />
				<n-form-text v-model="cell.state.toColor" v-if="cell.state.z" type="color" label="To Color" :timeout="600" @input="draw" />
				<n-form-combo v-model="cell.state.x" @input="draw" label="X Field" :filter="function() { return keys }"/>
				<page-formatted-configure v-if="cell.state.x" :fragment="cell.state.xFormat"/>
				<n-form-text v-model="cell.state.xInterval" type="number" label="X Label Interval" @input="draw" :timeout="600"/>
				<n-form-combo v-model="cell.state.y" @input="draw" :required="true" label="Y Field" :filter="function() { return keys }"/>
				<n-form-switch v-model="cell.state.drawGridX" label="Draw Grid X"/>
				<n-form-switch v-model="cell.state.drawGridY" label="Draw Grid Y"/>
				<n-form-text type="range" :minimum="0" :maximum="10" v-model="cell.state.areaOpacity" label="Area opacity" @input="draw" :timeout="600"/>
				<page-formatted-configure v-if="cell.state.y" :fragment="cell.state.yFormat"/>
				<n-form-combo v-model="cell.state.z" @input="draw" label="Z Field" :filter="function() { return keys }"/>
				<n-form-text type="range" v-model="cell.state.rotateX" :minimum="0" :maximum="90" label="Rotation X Label" :timeout="600" @input="draw"/>
				<n-form-text v-model="cell.state.yLabel" label="Y-Axis Label" :timeout="600" @input="draw" />
				<n-form-text v-if="false" v-model="cell.state.xTicks" label="# X-axis ticks" :timeout="600" @input="draw" />
				<n-form-switch v-model="cell.state.legend" label="Legend" @input="draw"/>
				<n-form-combo v-model="cell.state.sortBy" @input="draw" label="Sort By" :items="['x', 'y']"/>
				<n-form-switch v-model="cell.state.reverseSortBy" v-if="cell.state.orderBy" label="Reverse Sort By" @input="draw"/>
				<n-form-text v-model="cell.state.pointRadius" v-if="!cell.state.drawMouseLine" type="range" :minimum="0" :maximum="10" label="Point Radius" @input="draw" :timeout="600"/>
				<n-form-switch v-model="cell.state.drawMouseLine" v-if="!cell.state.pointRadius || cell.state.pointRadius <= 0" label="Draw line at mouse position" @input="draw"/>
				<n-form-text type="range" v-model="cell.state.strokeWidth" label="Line thickness" :minimum="1" :maximum="10"/>
				<n-form-combo v-model="cell.state.interpolation" label="Interpolation" @input="draw" 
					:filter="getInterpolationName"/>
				<n-form-switch v-model="cell.state.zoomX" label="Zoom X" @input="draw"/>
				<n-form-switch v-model="cell.state.zoomY" label="Zoom Y" @input="draw"/>
			</n-form-section>
		</data-common-header>
		<svg ref="svg"></svg>
		
		<data-common-footer :page="page" :parameters="parameters" :cell="cell" 
			:edit="edit"
			:records="records"
			:selected="selected"
			:inactive="inactive"
			:global-actions="globalActions"
			@updatedEvents="$emit('updatedEvents')"
			@close="$emit('close'); configuring=false"
			:multiselect="true"
			:updatable="true"/>
	</div>
</template>