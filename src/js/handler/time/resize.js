/**
 * @fileoverview Handling resize schedules from drag handler and time grid view
 * @author NHN FE Development Lab <dl_javascript@nhn.com>
 */
'use strict';

var util = require('tui-code-snippet');
var config = require('../../config');
var datetime = require('../../common/datetime');
var domutil = require('../../common/domutil');
var TZDate = require('../../common/timezone').Date;
var common = require('../../common/common');
var timeCore = require('./core');
var TimeResizeGuide = require('./resizeGuide');
var TimeCreation = require('./creation');

/**
 * @constructor
 * @implements {Handler}
 * @mixes timeCore
 * @mixes util.CustomEvents
 * @param {Drag} [dragHandler] - Drag handler instance.
 * @param {TimeGrid} [timeGridView] - TimeGrid view instance.
 * @param {Base} [baseController] - Base controller instance.
 */
function TimeResize(dragHandler, timeGridView, baseController, options) {

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

    /**
     * @type {function}
     */
    this._getScheduleDataFunc = null;

    /**
     * @type {object}
     */
    this._dragStart = null;

    this._dragStop = null;

    this._dragStartDirection = null;

    this._currentGridY = null;

    this._hourStartInDate = null;

    this._hourEndInDate = null;

    this._timeCreation = null;

    this._onMouseMoveCreation = null;

    /**
     * @type {TimeResizeGuide}
     */
    this._guide = new TimeResizeGuide(this);

    this._checkExpectedConditionResize = options.checkExpectedConditionResize;

    dragHandler.on('dragStart', this._onDragStart, this);

    // get time creation
    if (dragHandler.contexts && dragHandler.contexts.length > 0) {
        for (var i = 0; i < dragHandler.contexts.length; i++) {
            var context = dragHandler.contexts[i];
            if(context && context.length > 0)   {
                for (var k = 0; k < context.length; k++) {
                    var element = context[k];
                    if (element instanceof TimeCreation) {
                        this._timeCreation = element;
                    }
                }
            }
            
        }
    }
}

/**
 * Destroy method
 */
TimeResize.prototype.destroy = function() {
    this._guide.destroy();
    this.dragHandler.off(this);
    this.dragHandler = this.timeGridView = this.baseController =
        this._getScheduleDataFunc = this._dragStart = this._guide = null;
};

/**
 * @param {HTMLElement} target - element to check condition.
 * @returns {object|boolean} - return time view instance or false
 */
TimeResize.prototype.checkExpectCondition = function(target) {
    var container,
        matches;

    if (!domutil.hasClass(target, config.classname('time-top-resize-handle')) && !domutil.hasClass(target, config.classname('time-bottom-resize-handle'))) {
        return false;
    }

    container = domutil.closest(target, config.classname('.time-date'));

    if (!container) {
        return false;
    }

    matches = domutil.getClass(container).match(config.time.getViewIDRegExp);

    if (!matches || matches.length < 2) {
        return false;
    }

    return util.pick(this.timeGridView.children.items, Number(matches[1]));
};

TimeResize.prototype._getDragGrid = function() {
    var target = this.dragTarget,
        timeView = this.checkExpectCondition(target),
        blockElement = domutil.closest(target, config.classname('.time-date-schedule-block')),
        ctrl = this.baseController,
        targetModelID = domutil.getData(blockElement, 'id'),
        schedule = ctrl.schedules.items[targetModelID],
        getScheduleDataFromDateFunc = this._retriveScheduleDataFromDate(timeView);
    return getScheduleDataFromDateFunc(schedule.start, schedule.end, this.timeGridView.options.hourStart);
}

/**
 * @emits TimeResize#timeResizeDragstart
 * @param {object} dragStartEventData - event data of Drag#dragstart
 */
TimeResize.prototype._onDragStart = function(dragStartEventData) {
    var target = this.dragTarget = dragStartEventData.target,
        timeView = this.checkExpectCondition(target),
        blockElement = domutil.closest(target, config.classname('.time-date-schedule-block')),
        ctrl = this.baseController,
        targetModelID,
        getScheduleDataFunc,
        schedule,
        scheduleData;

    if (this._timeCreation) {
        this._onMouseMoveCreation = Object.assign(this._timeCreation._onMouseMove);
        this._timeCreation.guide._clearGuideElement();
        this._timeCreation._onMouseMove = null;
    }

    if (!timeView || !blockElement) {
        return;
    }

    if (domutil.hasClass(target, config.classname('time-top-resize-handle'))) {
        this._dragStartDirection = 'top';
        getScheduleDataFunc = this._getScheduleDataFunc = this._retriveScheduleData(timeView, 1);
    } else if (domutil.hasClass(target, config.classname('time-bottom-resize-handle'))) {
        this._dragStartDirection = 'bottom';
        getScheduleDataFunc = this._getScheduleDataFunc = this._retriveScheduleData(timeView, 2);
    }

    targetModelID = domutil.getData(blockElement, 'id');
    schedule = ctrl.schedules.items[targetModelID];

    scheduleData = this._dragStart = getScheduleDataFunc(
        dragStartEventData.originEvent, {
            targetModelID: targetModelID,
            schedule: schedule
        }
    );

    this._hourStartInDate = new TZDate(scheduleData.nearestGridTimeY);
    this._hourStartInDate.setHours(this.timeGridView.options.hourStart, 0, 0, 0);

    this._hourEndInDate = new TZDate(scheduleData.nearestGridTimeY);
    this._hourEndInDate.setHours(this.timeGridView.options.hourEnd, 0, 0, 0);
    
    this.dragHandler.on({
        drag: this._onDrag,
        dragEnd: this._onDragEnd,
        click: this._onClick
    }, this);

    /**
     * @event TimeResize#timeResizeDragstart
     * @type {object}
     * @property {HTMLElement} target - current target in mouse event object.
     * @property {Time} relatedView - time view instance related with mouse position.
     * @property {MouseEvent} originEvent - mouse event object.
     * @property {number} mouseY - mouse Y px mouse event.
     * @property {number} gridY - grid Y index value related with mouseY value.
     * @property {number} timeY - milliseconds value of mouseY points.
     * @property {number} nearestGridY - nearest grid index related with mouseY value.
     * @property {number} nearestGridTimeY - time value for nearestGridY.
     * @property {string} targetModelID - The model unique id emitted move schedule.
     * @property {Schedule} schedule - schedule data
     */
    this.fire('timeResizeDragstart', scheduleData);
    this._dragStop = null;
};

/**
 * Drag#drag event handler
 * @emits TimeResize#timeResizeDrag
 * @param {object} dragEventData - event data of Drag#drag custom event.
 * @param {string} [overrideEventName] - override emitted event name when supplied.
 * @param {function} [revise] - supply function for revise schedule data before emit.
 */
TimeResize.prototype._onDrag = function(dragEventData, overrideEventName, revise) {
    var getScheduleDataFunc = this._getScheduleDataFunc,
        startScheduleData = this._dragStart,
        customCondResult,
        dragGridRange = this._getDragGrid(),
        gridStartY = dragGridRange.nearestGridY,
        gridEndY = dragGridRange.nearestGridEndY,
        opt = this.timeGridView.options,
        scheduleData;

    if (!getScheduleDataFunc || !startScheduleData) {
        return;
    }

    scheduleData = getScheduleDataFunc(dragEventData.originEvent, {
        targetModelID: startScheduleData.targetModelID
    });

    if (this._currentGridY != scheduleData.nearestGridY) {
        this._currentGridY = scheduleData.nearestGridY;
        if (this._dragStartDirection == 'top') {
            if (scheduleData.nearestGridY >= gridEndY - opt.ratioHourGridY[1]) {
                scheduleData.nearestGridY = gridEndY - opt.ratioHourGridY[1];
                this._dragStop == null && (this._dragStop = scheduleData.nearestGridY);
            } else if (scheduleData.nearestGridTimeY.getTime() <= this._hourStartInDate.getTime()) {
                scheduleData.nearestGridY = 0;
                this._dragStop == null && (this._dragStop = scheduleData.nearestGridY);
            } else {
                this._dragStop = null;
            }
        } else if (this._dragStartDirection == 'bottom') {
            if (scheduleData.nearestGridY <= gridStartY + opt.ratioHourGridY[1]) {
                scheduleData.nearestGridY = gridStartY + opt.ratioHourGridY[1];
                this._dragStop == null && (this._dragStop = scheduleData.nearestGridY);
            } else if (scheduleData.nearestGridTimeY.getTime() >= this._hourEndInDate.getTime()) {
                scheduleData.nearestGridY = this._hourEndInDate.getHours() - opt.hourStart + this._getNearestHour(this._hourEndInDate.getMinutes(), opt.minuteCell, opt.ratioHourGridY);
                this._dragStop == null && (this._dragStop = scheduleData.nearestGridY);
            } else {
                this._dragStop = null;
            }
        } 
        
        if (this._checkExpectedConditionResize) {
            customCondResult = this._checkExpectedConditionResize(scheduleData);
            if (!customCondResult) {
                // return;
            }
        }

        if (revise) {
            revise(scheduleData);
        }

        /**
         * @event TimeResize#timeResizeDrag
         * @type {object}
         * @property {HTMLElement} target - current target in mouse event object.
         * @property {Time} relatedView - time view instance related with drag start position.
         * @property {MouseEvent} originEvent - mouse event object.
         * @property {number} mouseY - mouse Y px mouse event.
         * @property {number} gridY - grid Y index value related with mouseY value.
         * @property {number} timeY - milliseconds value of mouseY points.
         * @property {number} nearestGridY - nearest grid index related with mouseY value.
         * @property {number} nearestGridTimeY - time value for nearestGridY.
         * @property {string} targetModelID - The model unique id emitted move schedule.
         */
        this.fire(overrideEventName || 'timeResizeDrag', scheduleData);
    }
};

/**
 * Drag#dragEnd event handler
 * @emits TimeResize#timeResizeDragend
 * @param {MouseEvent} dragEndEventData - Mouse event of Drag#dragEnd custom event.
 */
TimeResize.prototype._onDragEnd = function(dragEndEventData) {
    var getScheduleDataFunc = this._getScheduleDataFunc,
        opt = this.timeGridView.options,
        dragStart = this._dragStart,
        schedule,
        scheduleData;

    if (this._timeCreation) {
        this._timeCreation._onMouseMove = this._onMouseMoveCreation;
    }

    this.dragHandler.off({
        drag: this._onDrag,
        dragEnd: this._onDragEnd,
        click: this._onClick
    }, this);

    if (!getScheduleDataFunc || !dragStart) {
        return;
    }

    scheduleData = getScheduleDataFunc(dragEndEventData.originEvent, {
        targetModelID: dragStart.targetModelID
    });

    if (this._dragStop != null) {
        var newNearestGridTimeY,
            hoursChange = opt.hourStart + parseInt(this._dragStop, 10),
            minutesChange = datetime.minutesFromHours(this._dragStop % 1),
            secondsChange  = 0,
            millisecondsChange = 0;
        newNearestGridTimeY = new TZDate(scheduleData.nearestGridTimeY);
        newNearestGridTimeY.setHours(hoursChange, minutesChange, secondsChange, millisecondsChange);

        scheduleData.gridY = this._dragStop;
        scheduleData.nearestGridY = this._dragStop;
        scheduleData.nearestGridTimeY= newNearestGridTimeY;
    }

    schedule = this.baseController.schedules.items[scheduleData.targetModelID];
        
    if (this._dragStartDirection == 'top') {
        scheduleData.newTime = {
            start: scheduleData.nearestGridTimeY,
            end: schedule.end
        };
    } else if (this._dragStartDirection == 'bottom') {
        scheduleData.newTime = {
            start: schedule.start,
            end: scheduleData.nearestGridTimeY
        };
    }

    this._updateSchedule(scheduleData);

    /**
     * @event TimeResize#timeResizeDragend
     * @type {object}
     * @property {HTMLElement} target - current target in mouse event object.
     * @property {Time} relatedView - time view instance related with drag start position.
     * @property {MouseEvent} originEvent - mouse event object.
     * @property {number} mouseY - mouse Y px mouse event.
     * @property {number} gridY - grid Y index value related with mouseY value.
     * @property {number} timeY - milliseconds value of mouseY points.
     * @property {number} nearestGridY - nearest grid index related with mouseY value.
     * @property {number} nearestGridTimeY - time value for nearestGridY.
     * @property {string} targetModelID - The model unique id emitted move schedule.
     * @property {number[]} range - milliseconds range between drag start and end.
     * @property {number[]} nearestRange - milliseconds range related with nearestGridY between start and end.
     */
    this.fire('timeResizeDragend', scheduleData);

    this._getScheduleDataFunc = this._dragStart = this._dragStop = this._hourStartInDate = this._hourEndInDate = this._dragStartDirection = null;
};

/**
 * Update model instance by dragend event results.
 * @fires TimeResize#beforeUpdateSchedule
 * @param {object} scheduleData - schedule data from TimeResize#timeResizeDragend
 */
TimeResize.prototype._updateSchedule = function(scheduleData) {
    var ctrl = this.baseController,
        modelID = scheduleData.targetModelID,
        schedule = ctrl.schedules.items[modelID],
        changes;

    if (!schedule) {
        return;
    }

    changes = common.getScheduleChanges(
        schedule,
        ['start', 'end'],
        { start: scheduleData.newTime.start, end: scheduleData.newTime.end }
    );

    /**
     * @event TimeResize#beforeUpdateSchedule
     * @type {object}
     * @property {Schedule} schedule - The original schedule instance
     * @property {Date} start - Deprecated: start time to update
     * @property {Date} end - Deprecated: end time to update
     * @property {object} changes - end time to update
     *  @property {date} end - end time to update
     */
    this.fire('beforeUpdateSchedule', {
        schedule: schedule,
        changes: changes
    });
};

/**
 * @emits TimeResize#timeResizeClick
 */
TimeResize.prototype._onClick = function() {
    this.dragHandler.off({
        drag: this._onDrag,
        dragEnd: this._onDragEnd,
        click: this._onClick
    }, this);

    /**
     * @event TimeResize#timeResizeClick
     */
    this.fire('timeResizeClick');
};

timeCore.mixin(TimeResize);
util.CustomEvents.mixin(TimeResize);

module.exports = TimeResize;
