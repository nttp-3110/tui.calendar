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

    this._dragStartDirection = null;

    this._gridStop = null;

    this._currentGridY = null;

    this._rangeTime = null;

    this._timeCreation = null;

    this._flagSwitchEvent = {
        click: false,
        hover: false
    };

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
            if (context && context.length > 0) {
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
TimeResize.prototype.destroy = function () {
    this._guide.destroy();
    this.dragHandler.off(this);
    this.dragHandler = this.timeGridView = this.baseController =
        this._getScheduleDataFunc = this._dragStart = this._guide = null;
};

/**
 * @param {HTMLElement} target - element to check condition.
 * @returns {object|boolean} - return time view instance or false
 */
TimeResize.prototype.checkExpectCondition = function (target) {
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

TimeResize.prototype._convertTimeToGridY = function (time) {
    var opt = this.timeGridView.options;
    return (time.getHours() - opt.hourStart + this._getNearestHour(time.getMinutes(), opt.minuteCell, opt.ratioHourGridY));
}

TimeResize.prototype._checkRangeGridY = function (gridY) {
    var newGridY = gridY;
    newGridY = Math.max(newGridY, this._rangeTime.nearestGridY);
    newGridY = Math.min(newGridY, this._rangeTime.nearestGridEndY);
    return newGridY;
}

TimeResize.prototype._getDragGridY = function (start, end) {
    var opt = this.timeGridView.options,
        nearestGridY = this._convertTimeToGridY(start),
        nearestGridEndY = this._convertTimeToGridY(end),
        dragGridY;

    if (end.getDate() - start.getDate() >= 1) {
        nearestGridEndY = opt.hourEnd;
    }
    dragGridY = {
        nearestGridY: nearestGridY,
        nearestGridTimeY: start,
        nearestGridEndY: nearestGridEndY,
        nearestGridEndTimeY: end
    };

    return dragGridY;
}

/**
 * @emits TimeResize#timeResizeDragstart
 * @param {object} dragStartEventData - event data of Drag#dragstart
 */
TimeResize.prototype._onDragStart = function (dragStartEventData) {
    var target = this.dragTarget = dragStartEventData.target,
        timeView = this.checkExpectCondition(target),
        blockElement = domutil.closest(target, config.classname('.time-date-schedule-block')),
        ctrl = this.baseController,
        getScheduleDataFunc,
        opt = this.timeGridView.options,
        timeCreation = this._timeCreation,
        targetModelID,
        scheduleData,
        schedule,
        rangeStart,
        rangeEnd,
        dragGridRange;

    if (!timeView || !blockElement) {
        return;
    }

    targetModelID = domutil.getData(blockElement, 'id');
    schedule = ctrl.schedules.items[targetModelID];

    if (schedule.resizable) {
        return;
    }

    dragGridRange = this._getDragGridY(schedule.start, schedule.end);

    if (domutil.hasClass(target, config.classname('time-top-resize-handle'))) {
        this._dragStartDirection = 'top';
        getScheduleDataFunc = this._getScheduleDataFunc = this._retriveScheduleData(timeView, 1);
    } else if (domutil.hasClass(target, config.classname('time-bottom-resize-handle'))) {
        this._dragStartDirection = 'bottom';
        getScheduleDataFunc = this._getScheduleDataFunc = this._retriveScheduleData(timeView, 2);
    }

    if (this._dragStartDirection && timeCreation) {
        timeCreation.guide._clearGuideElement();
        if (timeCreation._showCreationGuideOnClick) {
            this._flagSwitchEvent.click = true;
            timeCreation._showCreationGuideOnClick = false;
        }
        if (timeCreation._showCreationGuideOnHover) {
            this._flagSwitchEvent.hover = true;
            timeCreation._showCreationGuideOnHover = false;
        }
    }

    targetModelID = domutil.getData(blockElement, 'id');
    schedule = ctrl.schedules.items[targetModelID];

    rangeStart = new TZDate(dragGridRange.nearestGridTimeY);
    rangeStart.setHours(opt.hourStart, 0, 0, 0);

    rangeEnd = new TZDate(dragGridRange.nearestGridTimeY);
    rangeEnd.setHours(opt.hourEnd - 1, 59, 59, 0);

    this._rangeTime = this._getDragGridY(rangeStart, rangeEnd);

    scheduleData = this._dragStart = getScheduleDataFunc(
        dragStartEventData.originEvent, {
        targetModelID: targetModelID,
        schedule: schedule,
        rangeTime: this._rangeTime
    }
    );

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
    this._gridStop = null;
};

/**
 * Drag#drag event handler
 * @emits TimeResize#timeResizeDrag
 * @param {object} dragEventData - event data of Drag#drag custom event.
 * @param {string} [overrideEventName] - override emitted event name when supplied.
 * @param {function} [revise] - supply function for revise schedule data before emit.
 */
TimeResize.prototype._onDrag = function (dragEventData, overrideEventName, revise) {
    var customCondResult,
        opt = this.timeGridView.options,
        schedule,
        scheduleData,
        dragGridRange,
        gridStartY,
        topDirection = this._dragStartDirection == 'top',
        bottomDirection = this._dragStartDirection == 'bottom',
        gridEndY;

    if (!this._getScheduleDataFunc || !this._dragStart) {
        return;
    }

    schedule = this._dragStart.schedule;
    dragGridRange = this._getDragGridY(schedule.start, schedule.end);
    gridStartY = dragGridRange.nearestGridY;
    gridEndY = dragGridRange.nearestGridEndY;

    scheduleData = this._getScheduleDataFunc(dragEventData.originEvent, {
        targetModelID: this._dragStart.targetModelID,
        gridStartY: dragGridRange.nearestGridY,
        gridEndY: dragGridRange.nearestGridEndY,
        rangeTime: this._rangeTime
    });

    if (this._currentGridY != scheduleData.nearestGridY) {
        this._currentGridY = scheduleData.nearestGridY;

        if (revise) {
            revise(scheduleData);
        }

        // custom validate of calendar
        if (this._checkExpectedConditionResize) {
            customCondResult = this._checkExpectedConditionResize(scheduleData, this._dragStartDirection, dragGridRange, this._rangeTime, schedule);
            if (typeof customCondResult === 'boolean') {
                if (customCondResult) {
                    this._gridStop = null;
                } else {
                    this._gridStop = 0;
                    if (topDirection) {
                        scheduleData.nearestGridY = dragGridRange.nearestGridY;
                    } else if (bottomDirection) {
                        scheduleData.nearestGridY = dragGridRange.nearestGridEndY;
                    }
                }
            } else if (util.isNumber(customCondResult)) {
                this._gridStop = customCondResult;
                var timeFromInitialStart = new TZDate(dragGridRange.nearestGridTimeY);
                timeFromInitialStart.addMinutes(this._gridStop);
                scheduleData.nearestGridY = this._convertTimeToGridY(timeFromInitialStart);
            }
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
TimeResize.prototype._onDragEnd = function (dragEndEventData) {
    var opt = this.timeGridView.options,
        timeCreation = this._timeCreation,
        _flagSwitchEvent = this._flagSwitchEvent,
        schedule,
        dragGridRange,
        gridStartTimeY,
        topDirection = this._dragStartDirection == 'top',
        bottomDirection = this._dragStartDirection == 'bottom',
        scheduleData;

    if (timeCreation) {
        setTimeout(function () {
            _flagSwitchEvent.click && (timeCreation._showCreationGuideOnClick = true);
            _flagSwitchEvent.hover && (timeCreation._showCreationGuideOnHover = true);
        }, 100);
    }

    this.dragHandler.off({
        drag: this._onDrag,
        dragEnd: this._onDragEnd,
        click: this._onClick
    }, this);

    if (!this._getScheduleDataFunc) {
        return;
    }

    schedule = this._dragStart.schedule;
    dragGridRange = this._getDragGridY(schedule.start, schedule.end);
    gridStartTimeY = dragGridRange.nearestGridTimeY;

    scheduleData = this._getScheduleDataFunc(dragEndEventData.originEvent, {
        targetModelID: this._dragStart.targetModelID
    });

    schedule = this.baseController.schedules.items[scheduleData.targetModelID];

    if (util.isNumber(this._gridStop)) {
        var newNearestGridTimeY;

        newNearestGridTimeY = new TZDate(gridStartTimeY);
        newNearestGridTimeY.addMinutes(this._gridStop);

        scheduleData.gridY = scheduleData.nearestGridY = this._convertTimeToGridY(newNearestGridTimeY);
        scheduleData.nearestGridTimeY = newNearestGridTimeY;

    }
    // else if (util.isObject(this._gridStop)) {
    //     var newNearestGridTimeY,
    //         hoursChange = opt.hourStart + parseInt(this._gridStop.nearestGridY, 10),
    //         minutesChange = Math.round(datetime.minutesFromHours(this._gridStop.nearestGridY % 1)),
    //         secondsChange = 0,
    //         millisecondsChange = 0;

    //     hoursChange = hoursChange == 24 ? 0 : hoursChange;


    //     newNearestGridTimeY = new TZDate(gridStartTimeY);
    //     newNearestGridTimeY.setHours(hoursChange, minutesChange, secondsChange, millisecondsChange);

    //     scheduleData.gridY = scheduleData.nearestGridY = this._gridStop.nearestGridY;
    //     scheduleData.nearestGridTimeY = newNearestGridTimeY;
    // }

    if (this._gridStop == 0) {
        scheduleData.newTime = null;
    } else if (topDirection) {
        scheduleData.newTime = {
            start: scheduleData.nearestGridTimeY,
            end: schedule.end
        };
    } else if (bottomDirection) {
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

    this._flagSwitchEvent = {
        click: false,
        hover: false
    }

    this._getScheduleDataFunc = this._dragStart = this._gridStop = this._currentGridY = this._rangeTime = this._dragStartDirection = null;
};

/**
 * Update model instance by dragend event results.
 * @fires TimeResize#beforeUpdateSchedule
 * @param {object} scheduleData - schedule data from TimeResize#timeResizeDragend
 */
TimeResize.prototype._updateSchedule = function (scheduleData) {
    var ctrl = this.baseController,
        modelID = scheduleData.targetModelID,
        schedule = ctrl.schedules.items[modelID],
        timeChanges,
        changes;

    if (!schedule) {
        return;
    }

    if (scheduleData.newTime) {
        timeChanges = scheduleData.newTime;
    } else {
        timeChanges = schedule;
    }

    changes = common.getScheduleChanges(
        schedule,
        ['start', 'end'],
        timeChanges
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
        changes: changes,
        type: 'resize'
    });
};

/**
 * @emits TimeResize#timeResizeClick
 */
TimeResize.prototype._onClick = function () {
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