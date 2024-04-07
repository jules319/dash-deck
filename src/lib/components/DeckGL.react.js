import React from 'react';
import Deck from "deck.gl"; // eslint-disable-line import/no-named-as-default
import { GeoJsonLayer } from '@deck.gl/layers';
import { Map } from "react-map-gl";
import { Map as MapLibre } from 'react-map-gl/maplibre';
import {JSONConverter} from '@deck.gl/json';
import {CSVLoader} from "@loaders.gl/csv";
import {registerLoaders} from "@loaders.gl/core";
import * as core from '@deck.gl/core';
import * as layers from "@deck.gl/layers";
import * as aggregationLayers from "@deck.gl/aggregation-layers";
import * as geoLayers from "@deck.gl/geo-layers";
import * as meshLayers from "@deck.gl/mesh-layers";
import PropTypes from 'prop-types';
import GL from '@luma.gl/constants';

import * as LumaGL from '../lumagl';
import makeTooltip from '../tooltip';


// CSV loader is needed to download and read CSV Files
registerLoaders(CSVLoader);
// Configure the JSON converter to include all possible
// layers and views.
const configuration = {
  classes: Object.assign(
    {}, 
    layers, 
    aggregationLayers,
    geoLayers,
    meshLayers,
    // All the core elements of deck.gl
    core,
    // Cherry picked luma.gl exports relevant to deck
    LumaGL
  ),
  enumerations: {
    COORDINATE_SYSTEM: core.COORDINATE_SYSTEM,
    GL
  }
}
const jsonConverter = new JSONConverter({ configuration });


/**
 * This component lets you visualizes PyDeck and deck/json files
 * directly in Dash. It also exposes various events (such as click,
 * hover and drag) inside callbacks.
 */
export default class DeckGL extends React.Component {
  safeSetProps(events){
    // This method sanitizes the info and event objects that are
    // output by onClick, onHover, etc. Then, it proceeds to call setProps.
    const propsToClean = ["layer", "target", "rootElement"];

    Object.keys(events).map(key => {
      const e = events[key];
      // Cleaning starts here:
      propsToClean.map(prop => {
        if (prop in e && e[prop] !== null){
          e[prop] = e[prop].toString();
        }
      })
    })

    if ('setProps' in this.props){
      this.props.setProps(events);
    } else {
      console.warn(
        "setProps is not a function of this.props, as a result the following object was not updated:", 
        events,
      );
    }
  }

  componentDidMount() {
    const { disableContext } = this.props
    if (disableContext) {
        document
            .getElementById("deckgl-wrapper")
            .addEventListener("contextmenu", evt => evt.preventDefault());
    }
  }


  getElevation = f => {
    const { timeStep, cropGrowthStageData } = this.props;
    const plotId = f.properties.Plot_No;
    return cropGrowthStageData.plot[plotId][timeStep -1];
  };

  getColor = f => {
    const { timeStep, cropGrowthStageData } = this.props;
    const plotId = f.properties.Plot_No;
    let position = cropGrowthStageData.plot[plotId][timeStep -1] / 25;
    let color1 = [255, 255, 0];
    let color2 = [1, 50, 32];
    let r = Math.round((1 - position) * color1[0] + position * color2[0]);
    let g = Math.round((1 - position) * color1[1] + position * color2[1]);
    let b = Math.round((1 - position) * color1[2] + position * color2[2]);
    return [r, g, b];
  };

  handlePlotClick = (info, e) => {
    let plotId = "working";
    if (info.object) {
      plotId = info.object.properties.Plot_No;
    }

    if ('setProps' in this.props){
      this.props.setProps({selectedFieldPlot: plotId});
    } else {
      console.warn(
        "setProps is not a function of this.props, as a result the following object was not updated:", 
        {selectedFieldPlot: plotId},
      );
    }
  };

  render() {
    let {enableEvents, deckJSON, cropGeoJsonData, timeStep} = this.props;
    const {id, mapboxKey, tooltip, style} = this.props;

    // ******* PARSE AND CONVERT JSON *******
    // If deckJSON is a string, we need to convert into JSON format
    if (typeof(deckJSON) === "string"){
      deckJSON = JSON.parse(deckJSON);
    }
    if (typeof(cropGeoJsonData) === "string"){
      cropGeoJsonData = JSON.parse(cropGeoJsonData);
    }
    if (typeof(cropGrowthStageData) === "string"){
      cropGrowthStageData = JSON.parse(cropGrowthStageData);
    }
    
    // Now, we can convert the JSON document to a deck object
    const deckProps = jsonConverter.convert(deckJSON);

    // ******** UPDATE DECK PROPS ********
    // Assign the ID to the deck object
    deckProps.id = id;
    // Extract the map style from JSON document, since the map style 
    // is sometimes located in deckJSON.views.length
    if (!("mapStyle" in deckProps) && "views" in deckJSON && deckJSON.views.length > 0){
      deckProps.mapStyle = deckJSON.views[0].mapStyle;
    }

    // ******** STATIC MAP ******** 
    // Only render static map if a mapbox token was given, else fallback to the maplibre backend
    let staticMap;
    if (mapboxKey !== null){
      staticMap = <Map
        mapboxAccessToken={mapboxKey}
        mapStyle={deckProps.mapStyle}
      />
    } else {
      staticMap = <MapLibre
          mapStyle={deckProps.mapStyle}
      />
    }

    // ******** EVENT CALLBACKS ********
    // First, convert enableEvents to list if it was a boolean
    if (enableEvents === true){
      enableEvents = ['click', 'dragStart', 'dragEnd', 'hover'];
    }
    else if (enableEvents === false){
      enableEvents = [];
    }
    // Now, construct the respective functions
    const clickFn = (info, e) => this.safeSetProps({clickInfo: info, clickEvent: e});
    const dragStartFn = (info, e) => this.safeSetProps({dragStartInfo: info, dragStartEvent: e});
    const dragEndFn = (info, e) => this.safeSetProps({dragEndInfo: info, dragEndEvent: e});
    const hoverFn = (info, e) => this.safeSetProps({hoverInfo: info, hoverEvent: e});

    // Finally, assign them as prop to deckProps
    deckProps.onClick = enableEvents.includes("click") ? clickFn: null;
    deckProps.onDragStart = enableEvents.includes("dragStart") ? dragStartFn: null;
    deckProps.onDragEnd = enableEvents.includes("dragEnd") ? dragEndFn: null;
    deckProps.onHover = enableEvents.includes("hover") ? hoverFn: null;

    // ******** CUSTOM GEOJSON LAYER ********
    let layer = new GeoJsonLayer({
      id: 'geojson-layer',
      data: cropGeoJsonData, // Use imported GeoJSON data
      extruded: true,
      opacity: 0.8,
      pickable: true,
      lineWidthMinPixels: 1,
      wireframe: true,
      filled: true,
      getElevation: this.getElevation,
      getFillColor: this.getColor,
      updateTriggers: {
        getElevation: timeStep, // Update when timeStep changes
        getFillColor: timeStep
      },
      onClick: this.handlePlotClick, // Use the handlePlotClick method for onClick
    });
    deckProps.layers.push(layer);

    return (
      <Deck
          getTooltip={({ object }) => object && `Plot ${object.properties.Plot_No}`}
          style={style}
          {...deckProps}
      >
        {staticMap}
      </Deck>
  );

  }
}

DeckGL.defaultProps = {
    deckJSON: {},
    mapboxKey: null,
    tooltip: false,
    enableEvents: false,
    disableContext: false,
    style: {},
    timeStep: 1,
    selectedField: ["Western Corn"],
    selectedFieldPlot: null
};

DeckGL.propTypes = {
    /**
     * Your map using the Deck.gl JSON format. This can be generated by calling
     * `pdk.Deck(...).to_json()`. Both a Python dictionary and a JSON-string your map is accepted.
     */
    deckJSON: PropTypes.oneOfType([PropTypes.object, PropTypes.string]),

    /**
     * The GeoJSON data that will be used to display the crop on a geolayer.
     */
    cropGeoJsonData: PropTypes.oneOfType([PropTypes.object, PropTypes.string]),

    /**
     * The data that will be used by getElevation and getColor to display
     * crop growth stage in the cropGeoLayer.
     */
    cropGrowthStageData: PropTypes.oneOfType([PropTypes.object, PropTypes.string]),

    /**
     * The timestep of the data that will be used by getElevation and getColor to display
     * crop growth stage in the cropGeoLayer.
      */
    timeStep: PropTypes.number,

    /**
     * The field that will be focused on.
      */
    selectedField: PropTypes.array,

    /**
     * The current selected plot of the selected field.
      */
    selectedFieldPlot: PropTypes.string,

    /**
     * The ID used to identify this component in Dash callbacks.
     */
    id: PropTypes.string,

    /**
     * Custom CSS for your map. This is useful for changing the height, width, and sometimes the background color.
     */
    style: PropTypes.object,

    /**
     * Either a boolean indicating if all event callbacks should be enabled, or a list of strings
     * indicating which ones should be used. If it's a list, you will need to specify one of the
     * following gestures: `click`, `dragStart`, `dragEnd`, `hover`.
     */
    enableEvents: PropTypes.oneOfType([
      PropTypes.arrayOf(PropTypes.string), PropTypes.bool
    ]),

    /**
     * This can be a boolean value (e.g. `True`, `False`) to display the default tooltip.
     * You can also give a dictionary specifying an `html` template and custom style using `css`. For more
     * information about templating, see: https://pydeck.gl/tooltip.html
     */
    tooltip: PropTypes.oneOfType([PropTypes.object, PropTypes.bool]),


    /**
     * You will need a mapbox token to use deck.gl. Please create a mapbox
     * and follow the instructions here: https://docs.mapbox.com/help/how-mapbox-works/access-tokens/
     */
    mapboxKey: PropTypes.string,

    /**
     * This is a boolean value (e.g. `True`, `False`)  indicating whether or not to disable the default context menu
     * that shows up when right clicking on the map. If set to `True`, right clicking to rotate
     * a map or adjust its pitch will not trigger the default context menu.
     */
    disableContext: PropTypes.bool,


    /**
     * Read-only prop. To use this, make sure that `enableEvents` is set to `True`, or that `enableEvents` is a list that contains this event type.
     * This prop is updated when an element in the map is clicked. This contains
     * the original gesture event (in JSON).
     */
    clickEvent: PropTypes.object,


    /**
     * Read-only prop. To use this, make sure that `enableEvents` is set to `True`, or that `enableEvents` is a list that contains this event type.
     * This prop is updated when an element in the map is clicked. This contains
     * the picking info describing the object being clicked.
     * Complete description here:
     * https://deck.gl/docs/developer-guide/interactivity#the-picking-info-object
     */
    clickInfo: PropTypes.object,


    /**
     * Read-only prop. To use this, make sure that `enableEvents` is set to `True`, or that `enableEvents` is a list that contains this event type.
     * This prop is updated when an element in the map is hovered. This contains
     * the original gesture event (in JSON).
     */
    hoverEvent: PropTypes.object,


    /**
     * Read-only prop. To use this, make sure that `enableEvents` is set to `True`, or that `enableEvents` is a list that contains this event type.
     * This prop is updated when an element in the map is hovered. This contains
     * the picking info describing the object being hovered.
     * Complete description here:
     * https://deck.gl/docs/developer-guide/interactivity#the-picking-info-object
     */
    hoverInfo: PropTypes.object,

    /**
     * Read-only prop. To use this, make sure that `enableEvents` is set to `True`, or that `enableEvents` is a list that contains this event type.
     * To use this, make sure that `enableEvents` is set to `True`, or that `enableEvents` is a list that contains this event type. 
     * This prop is updated when the user starts dragging on the canvas. This contains
     * the original gesture event (in JSON).
     */
    dragStartEvent: PropTypes.object,


    /**
     * Read-only prop. To use this, make sure that `enableEvents` is set to `True`, or that `enableEvents` is a list that contains this event type.
     * This prop is updated when the user starts dragging on the canvas. This contains
     * the picking info describing the object being dragged.
     * Complete description here:
     * https://deck.gl/docs/developer-guide/interactivity#the-picking-info-object
     */
    dragStartInfo: PropTypes.object,


    /**
     * Read-only prop. To use this, make sure that `enableEvents` is set to `True`, or that `enableEvents` is a list that contains this event type.
     * This prop is updated when the user releases from dragging the canvas. This contains
     * the original gesture event (in JSON).
     */
    dragEndEvent: PropTypes.object,


    /**
     * Read-only prop. To use this, make sure that `enableEvents` is set to `True`, or that `enableEvents` is a list that contains this event type.
     * This prop is updated when the user releases from dragging the canvas. This contains
     * the picking info describing the object being dragged.
     * Complete description here:
     * https://deck.gl/docs/developer-guide/interactivity#the-picking-info-object
     */
    dragEndInfo: PropTypes.object,

    /**
     * Dash-assigned callback that should be called to report property changes
     * to Dash, to make them available for callbacks.
     */
    setProps: PropTypes.func
};
