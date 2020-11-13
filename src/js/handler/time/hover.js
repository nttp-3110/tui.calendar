/**
 * @fileoverview Allday event click event hander module
 * @author NHN FE Development Lab <dl_javascript@nhn.com>
 */
'use strict';

var util = require('tui-code-snippet');

/**
 * @constructor
 * @implements {Handler}
 * @mixes util.CustomEvents
 * @param {Drag} [dragHandler] - Drag handler instance.
 * @param {TimeGrid} [timeGridView] - TimeGrid view instance.
 * @param {Base} [baseController] - Base controller instance.
 */
function TimeHover(dragHandler, timeGridView, baseController) {
    console.log(dragHandler, ' ===> dragHandler');
    /**
     * @type {Drag}
     */
    this.dragHandler = dragHandler;

    /**
     * @type {TimeGrid}
     */
    this.timeGridView = timeGridView;

    /**
     * @type {Base}
     */
    this.baseController = baseController;

    this.dragHandler.on({
        'hover': this._onHover
    }, this);
}

/**
 * Click event hander
 * @param {object} clickEvent - click event from {@link Drag}
 * @emits TimeHover#clickEvent
 */
TimeHover.prototype._onHover = function(clickEvent) {
   console.log('-=-=-=-=-');
};

util.CustomEvents.mixin(TimeHover);

module.exports = TimeHover;
