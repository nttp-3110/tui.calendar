/**
 * @fileoverview Handling creation events from drag handler and time grid view
 * @author NHN FE Development Lab <dl_javascript@nhn.com>
 */
'use strict';

var util = require('tui-code-snippet');
var config = require('../../config');
var array = require('../../common/array');
var datetime = require('../../common/datetime');
var domutil = require('../../common/domutil');
var domevent = require('../../common/domevent');
var common = require('../../common/common');
var TimeCreationGuide = require('./creationGuide');
var TZDate = require('../../common/timezone').Date;
var timeCore = require('./core');

/**
 * @constructor
 * @implements {Handler}
 * @mixes timeCore
 * @mixes CustomEvents
 * @param {Drag} [dragHandler] - Drag handler instance.
 * @param {TimeGrid} [timeGridView] - TimeGrid view instance.
 * @param {Base} [baseController] - Base controller instance.
 * @param {Options} [options] - calendar Options
 */
function TimeCreation(dragHandler, timeGridView, baseController, options) {
    /**
     * Drag handler instance.
     * @type {Drag}
     */
    this.dragHandler = dragHandler;

    /**
     * TimeGrid view instance.
     * @type {TimeGrid}
     */
    this.timeGridView = timeGridView;

    /**
     * Base controller instance.
     * @type {Base}
     */
    this.baseController = baseController;

    /**
     * @type {TimeCreationGuide}
     */
    this.guide = new TimeCreationGuide(this);

    /**
     * Temporary function for single drag session's calc.
     * @type {function}
     */
    this._getScheduleDataFunc = null;

    /**
     * Temporary function for drag start data cache.
     * @type {object}
     */
    this._dragStart = null;

    /**
     * @type {boolean}
     */
    this._requestOnClick = false;

    /**
     * @type {boolean}
     */
    this._disableDblClick = options.disableDblClick;

    /**
     * @type {boolean}
     */
    this._showCreationGuideOnHover = options.showCreationGuideOnHover;

    /**
     * @type {boolean}
     */
    this._showCreationGuideOnClick = options.showCreationGuideOnClick;

    /**
     * @type {function}
     */
    this._checkExpectedConditionHover = options.checkExpectedConditionHover;

    /**
     * @type {function}
     */
    this._checkExpectedConditionClick = options.checkExpectedConditionClick;

    /**
     * @type {function}
     */
    this._creationGuideTemplate = options.template.creationGuide;

    /**
     * @type {boolean}
     */
    this._disableClick = options.disableClick;

    this.HOVER_DELAY = (options.timeDelay && options.timeDelay.hover) || 2000;

    this.CLICK_DELAY = (options.timeDelay && options.timeDelay.click) || 300;

    var debounce = function(func, delay) {
        var inDebounce
        return function() {
            var context = this
            var args = arguments
            clearTimeout(inDebounce)
            inDebounce = setTimeout(function() {
                return func.apply(context, args);
            }, delay);
        }
    }

    dragHandler.on('dragStart', this._onDragStart, this);
    dragHandler.on('click', this._onClick, this);

    if (this._showCreationGuideOnClick) {
        domevent.on(timeGridView.container, 'click', this._onClick, this);
    }

    if (this._showCreationGuideOnHover) {
        var onHoverDelay = debounce(function(evt) {
            this._onMouseMove(evt);
        }, this.HOVER_DELAY);
        domevent.on(timeGridView.container, 'mousemove', onHoverDelay, this);
        domevent.on(timeGridView.container, 'mouseleave', this._onMouseLeave, this);
    }

    if (this._disableDblClick) {
        this.CLICK_DELAY = 0;
    } else {
        domevent.on(timeGridView.container, 'dblclick', this._onDblClick, this);
    }
}

/**
 * Destroy method
 */
TimeCreation.prototype.destroy = function() {
    var timeGridView = this.timeGridView;

    this.guide.destroy();
    this.dragHandler.off(this);

    if (timeGridView && timeGridView.container) {
        domevent.off(timeGridView.container, 'dblclick', this._onDblClick, this);
    }

    this.dragHandler = this.timeGridView = this.baseController =
        this._getScheduleDataFunc = this._dragStart = this.guide = null;
};

/**
 * Check target element is expected condition for activate this plugins.
 * @param {HTMLElement} target - The element to check
 * @returns {(boolean|Time)} - return Time view instance when satiate condition.
 */
TimeCreation.prototype.checkExpectedCondition = function(target) {
    var cssClass = domutil.getClass(target),
        matches;
    if (cssClass === config.classname('time-date-schedule-block-wrap')) {
        target = target.parentNode;
        cssClass = domutil.getClass(target);
    }

    matches = cssClass.match(config.time.getViewIDRegExp);

    if (!matches || matches.length < 2) {
        return false;
    }

    return util.pick(this.timeGridView.children.items, matches[1]);
};

/**
 * Drag#dragStart event handler.
 * @emits TimeCreation#timeCreationDragstart
 * @param {object} dragStartEventData - Drag#dragStart event data.
 * @param {string} [overrideEventName] - override emitted event name when supplied.
 * @param {function} [revise] - supply function for revise event data before emit.
 */
TimeCreation.prototype._onDragStart = function(dragStartEventData, overrideEventName, revise) {
    var target = dragStartEventData.target,
        result = this.checkExpectedCondition(target),
        getScheduleDataFunc,
        eventData;

    if (!result) {
        return;
    }

    getScheduleDataFunc = this._getScheduleDataFunc = this._retriveScheduleData(result);
    eventData = this._dragStart = getScheduleDataFunc(dragStartEventData.originEvent);

    if (revise) {
        revise(eventData);
    }

    this.dragHandler.on({
        drag: this._onDrag,
        dragEnd: this._onDragEnd
    }, this);

    /**
     * @event TimeCreation#timeCreationDragstart
     * @type {object}
     * @property {Time} relatedView - time view instance related with mouse position.
     * @property {MouseEvent} originEvent - mouse event object.
     * @property {number} mouseY - mouse Y px mouse event.
     * @property {number} gridY - grid Y index value related with mouseY value.
     * @property {number} timeY - milliseconds value of mouseY points.
     * @property {number} nearestGridY - nearest grid index related with mouseY value.
     * @property {number} nearestGridTimeY - time value for nearestGridY.
     */
    this.fire(overrideEventName || 'timeCreationDragstart', eventData);
};

/**
 * Drag#drag event handler
 * @emits TimeCreation#timeCreationDrag
 * @param {object} dragEventData - event data from Drag#drag.
 * @param {string} [overrideEventName] - override emitted event name when supplied.
 * @param {function} [revise] - supply function for revise event data before emit.
 */
TimeCreation.prototype._onDrag = function(dragEventData, overrideEventName, revise) {
    var getScheduleDataFunc = this._getScheduleDataFunc,
        eventData;

    if (!getScheduleDataFunc) {
        return;
    }

    eventData = getScheduleDataFunc(dragEventData.originEvent);

    if (revise) {
        revise(eventData);
    }

    /**
     * @event TimeCreation#timeCreationDrag
     * @type {object}
     * @property {Time} relatedView - time view instance related with mouse position.
     * @property {MouseEvent} originEvent - mouse event object.
     * @property {number} mouseY - mouse Y px mouse event.
     * @property {number} gridY - grid Y index value related with mouseY value.
     * @property {number} timeY - milliseconds value of mouseY points.
     * @property {number} nearestGridY - nearest grid index related with mouseY value.
     * @property {number} nearestGridTimeY - time value for nearestGridY.
     */
    this.fire(overrideEventName || 'timeCreationDrag', eventData);
};

/**
 * @fires TimeCreation#beforeCreateSchedule
 * @param {object} eventData - event data object from TimeCreation#timeCreationDragend
 * or TimeCreation#timeCreationClick
 */
TimeCreation.prototype._createSchedule = function(eventData) {
    var relatedView = eventData.relatedView,
        createRange = eventData.createRange,
        nearestGridTimeY = eventData.nearestGridTimeY,
        nearestGridEndTimeY = eventData.nearestGridEndTimeY
            ? eventData.nearestGridEndTimeY
            : new TZDate(nearestGridTimeY).addMinutes(30),
        baseDate,
        dateStart,
        dateEnd,
        start,
        end;

    if (!createRange) {
        createRange = [
            nearestGridTimeY,
            nearestGridEndTimeY
        ];
    }

    baseDate = new TZDate(relatedView.getDate());
    dateStart = datetime.start(baseDate);
    dateEnd = datetime.getStartOfNextDay(baseDate);
    start = common.limitDate(createRange[0], dateStart, dateEnd);
    end = common.limitDate(createRange[1], dateStart, dateEnd);

    /**
     * @event TimeCreation#beforeCreateSchedule
     * @type {object}
     * @property {boolean} isAllDay - whether schedule is fired in allday view area?
     * @property {Date} start - select start time
     * @property {Date} end - select end time
     * @property {TimeCreationGuide} guide - TimeCreationGuide instance
     * @property {string} triggerEventName - event name
     */
    this.fire('beforeCreateSchedule', {
        isAllDay: false,
        start: new TZDate(start),
        end: new TZDate(end),
        guide: this.guide,
        triggerEventName: eventData.triggerEvent
    });
};

/**
 * Drag#dragEnd event handler
 * @emits TimeCreation#timeCreationDragend
 * @param {object} dragEndEventData - event data from Drag#dragend
 */
TimeCreation.prototype._onDragEnd = function(dragEndEventData) {
    var self = this,
        dragStart = this._dragStart;

    this.dragHandler.off({
        drag: this._onDrag,
        dragEnd: this._onDragEnd
    }, this);

    /**
     * Function for manipulate event data before firing event
     * @param {object} eventData - event data
     */
    function reviseFunc(eventData) {
        var range = [
            dragStart.nearestGridTimeY,
            eventData.nearestGridTimeY
        ].sort(array.compare.num.asc);
        range[1].addMinutes(30);

        eventData.createRange = range;

        self._createSchedule(eventData);
    }

    /**
     * @event TimeCreation#timeCreationDragend
     * @type {object}
     * @property {Time} relatedView - time view instance related with mouse position.
     * @property {MouseEvent} originEvent - mouse event object.
     * @property {number} mouseY - mouse Y px mouse event.
     * @property {number} gridY - grid Y index value related with mouseY value.
     * @property {number} timeY - milliseconds value of mouseY points.
     * @property {number} nearestGridY - nearest grid index related with mouseY value.
     * @property {number} nearestGridTimeY - time value for nearestGridY.
     * @property {number[]} createRange - milliseconds range between drag start and end to create.
     */
    this._onDrag(dragEndEventData, 'timeCreationDragend', reviseFunc);

    this._dragStart = this._getScheduleDataFunc = null;
};
/**
 * Drag#click event handler
 * @emits TimeCreation#timeCreationHover
 * @param {object} clickEventData - event data from Drag#click.
 */
TimeCreation.prototype._onMouseMove = function(clickEventData) {
    var self = this,
        condResult,
        getScheduleDataFunc,
        eventData,
        customCondResult;

    this.dragHandler.off({
        drag: this._onDrag,
        dragEnd: this._onDragEnd
    }, this);

    condResult = this.checkExpectedCondition(clickEventData.target);
    if (!condResult || this._disableHover) {
        // self.fire('clearCreationGuide', eventData);

        return;
    }

    getScheduleDataFunc = this._retriveScheduleData(condResult, 1);
    eventData = getScheduleDataFunc(clickEventData);
    if (this._checkExpectedConditionHover) {
        customCondResult = this._checkExpectedConditionHover(eventData);
        if (!customCondResult) {
            return;
        }
    }
    eventData.endTime = customCondResult.endTime;
    eventData.delta = customCondResult.delta;
    eventData.template = this._creationGuideTemplate;
    this._requestOnHover = true;
    if (self._requestOnHover) {
        self.fire('timeCreationHover', eventData);
        // self._createSchedule(eventData);
    }
    self._requestOnHover = false;
    this._dragStart = this._getScheduleDataFunc = null;
};

/**
 * Drag#hover event handler
 * @emits TimeCreation#timeCreationHover
 * @param {object} hoveEvenData - event data from Drag#hover.
 */
TimeCreation.prototype._onMouseLeave = function() { // hoveEvenData
    var self = this;
    var eventData; // condResult, getScheduleDataFunc, eventData;

    self.fire('clearCreationGuide', eventData);

    this._dragStart = this._getScheduleDataFunc = null;
};

/**
 * Drag#click event handler
 * @emits TimeCreation#timeCreationClick
 * @param {object} clickEventData - event data from Drag#click.
 */
TimeCreation.prototype._onClick = function(clickEventData) {
    var self = this;
    var condResult, getScheduleDataFunc, eventData, customCondResult;
    this.dragHandler.off({
        drag: this._onDrag,
        dragEnd: this._onDragEnd
    }, this);

    condResult = this.checkExpectedCondition(clickEventData.target);
    if (!condResult || this._disableHover) {
        // self.fire('clearCreationGuide', eventData);

        return;
    }

    getScheduleDataFunc = this._retriveScheduleData(condResult, 1);
    eventData = getScheduleDataFunc(clickEventData);
    if (this._checkExpectedConditionClick) {
        customCondResult = this._checkExpectedConditionClick(eventData);
        if (!customCondResult) {
            return;
        }
    }
    eventData.endTime = customCondResult.endTime;
    eventData.delta = customCondResult.delta;
    eventData.template = this._creationGuideTemplate;
    this._requestOnClick = true;
    setTimeout(function() {
        if (self._requestOnClick) {
            self.fire('timeCreationClick', eventData);
            self._createSchedule(eventData);
            // trigger click guide element
            self.guide._clickGuideElement(self.guide.guideElement.getBoundingClientRect());
        }
        self._requestOnClick = false;
    }, this.CLICK_DELAY);
    this._dragStart = this._getScheduleDataFunc = null;
};

/**
 * Dblclick event handler
 * @param {MouseEvent} e - Native MouseEvent
 */
TimeCreation.prototype._onDblClick = function(e) {
    var condResult, getScheduleDataFunc, eventData;

    condResult = this.checkExpectedCondition(e.target);
    if (!condResult) {
        return;
    }

    getScheduleDataFunc = this._retriveScheduleData(condResult);
    eventData = getScheduleDataFunc(e);

    this.fire('timeCreationClick', eventData);

    this._createSchedule(eventData);

    this._requestOnClick = false;
};

/**
 * Invoke creation click
 * @param {Schedule} schedule - schedule instance
 */
TimeCreation.prototype.invokeCreationClick = function(schedule) {
    var opt = this.timeGridView.options,
        range = datetime.range(
            opt.renderStartDate,
            opt.renderEndDate,
            datetime.MILLISECONDS_PER_DAY),
        hourStart = opt.hourStart,
        targetDate = schedule.start;
    var getScheduleDataFunc, eventData, timeView;

    util.forEach(range, function(date, index) {
        if (datetime.isSameDate(date, targetDate)) {
            timeView = this.timeGridView.children.toArray()[index];
        }
    }, this);

    // If start date is not in current date, set start date as first date.
    if (!timeView) {
        timeView = this.timeGridView.children.toArray()[0];
    }

    getScheduleDataFunc = this._retriveScheduleDataFromDate(timeView);
    eventData = getScheduleDataFunc(schedule.start, schedule.end, hourStart);

    this.fire('timeCreationClick', eventData);

    this._createSchedule(eventData);
};

timeCore.mixin(TimeCreation);
util.CustomEvents.mixin(TimeCreation);

module.exports = TimeCreation;
