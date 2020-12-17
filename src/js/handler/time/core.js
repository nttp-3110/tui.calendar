/**
 * @fileoverview Core methods for dragging actions
 * @author NHN FE Development Lab <dl_javascript@nhn.com>
 */
'use strict';

var util = require('tui-code-snippet');
var common = require('../../common/common');
var datetime = require('../../common/datetime');
var domevent = require('../../common/domevent');
var Point = require('../../common/point');
var TZDate = require('../../common/timezone').Date;

/**
 * @mixin Time.Core
 */
var timeCore = {
    _convertTimeToGridY: function(time, options) {
        return (time.getHours() - options.hourStart + this._getNearestHour(time.getMinutes(), options.minuteCell, options.ratioHourGridY));
    },
    _getDragGridY: function(start, end, options) {
        var nearestGridY = this._convertTimeToGridY(start, options),
            nearestGridEndY = this._convertTimeToGridY(end, options);

        if (end.getDate() - start.getDate() >= 1) {
            nearestGridEndY = options.hourEnd;
        }

        return ({
            nearestGridY: nearestGridY,
            nearestGridTimeY: start,
            nearestGridEndY: nearestGridEndY,
            nearestGridEndTimeY: end
        });
    },
    _getRangeTime: function(dateTime, options) {
        var rangeStart, rangeEnd;

        rangeStart = new TZDate(dateTime);
        rangeStart.setHours(options.hourStart, 0, 0, 0);

        rangeEnd = new TZDate(dateTime);
        rangeEnd.setHours(options.hourEnd - 1, 59, 59, 0);

        return this._getDragGridY(rangeStart, rangeEnd, options);
    },
    /**
     * Get the nearest hour
     * @param {number} minutes - minutes
     * @returns {number} hour
     */
    _getNearestHour: function(minutes, minMinute, ratioHourGridY) {
        if (ratioHourGridY[minutes / minMinute]) {
            return ratioHourGridY[minutes / minMinute];
        }
        return Number((minutes / 60).toFixed(2));
    },
    _getNearestGridY: function(gridY, ratioHourGridY, direction) {
        if (direction == 'top') {
            for (var i = 0; i < ratioHourGridY.length; i++) {
                var element = ratioHourGridY[i];
                var previousElement = ratioHourGridY[i - 1];
                if (gridY <= element) {
                    return previousElement || 0;
                }
            }
        } else if (direction == 'bottom') {
            return common.nearest(gridY, ratioHourGridY);
        }
        return 0;
    },
    /**
     * Get Y index ratio(hour) in time grids by supplied parameters.
     * @param {number} baseMil - base milliseconds number for supplied height.
     * @param {number} height - container element height.
     * @param {number} y - Y coordinate to calculate hour ratio.
     * @returns {number} hour index ratio value.
     */
    _calcGridYIndex: function(baseMil, height, y, options, nearestBy) {
        // get ratio from right expression > point.y : x = session.height : baseMil
        // and convert milliseconds value to hours.
        var result = datetime.millisecondsTo('hour', (y * baseMil) / height),
            floored = result | 0,
            nearestTop = nearestBy === 1, // top
            nearestBottom = nearestBy === 2, // bottom
            nearest;

        if (nearestTop || nearestBottom) {
            for (var i = 0; i < options.ratioHourGridY.length; i++) {
                var element = options.ratioHourGridY[i];
                if ((result - floored) <= element) {
                    if (nearestTop) {
                        nearest = options.ratioHourGridY[i - 1] || 0;
                    } else if (nearestBottom) {
                        nearest = options.ratioHourGridY[i] || 0;
                    }
                    break;
                }
            }
        } else {
            nearest = common.nearest(result - floored, options.ratioHourGridY);
        }
        return floored + (nearest || 0);
    },

    /**
     * Get function to makes event data from Time and mouseEvent
     * @param {Time} timeView - Instance of time view.
     * @returns {function} - Function that return event data from mouse event.
     */
    _retriveScheduleData: function(timeView, nearestBy) {
        var self = this,
            container = timeView.container,
            options = timeView.options,
            viewHeight = timeView.getViewBound().height,
            viewTime = timeView.getDate(),
            hourLength = options.hourEnd - options.hourStart,
            baseMil = datetime.millisecondsFrom('hour', hourLength);

        /**
         * @param {MouseEvent} mouseEvent - mouse event object to get common event data.
         * @param {object} [extend] - object to extend event data before return.
         * @returns {object} - common event data for time.*
         */
        return util.bind(function(mouseEvent, extend) {
            var mouseY = Point.n(domevent.getMousePosition(mouseEvent.originEvent || mouseEvent, container)).y,
                gridY = common.ratio(viewHeight, hourLength, mouseY),
                timeY = new TZDate(viewTime).addMinutes(datetime.minutesFromHours(gridY)),
                nearestGridY = self._calcGridYIndex(baseMil, viewHeight, mouseY, options, nearestBy),
                nearestGridTimeY = new TZDate(viewTime).addMinutes(
                    datetime.minutesFromHours(nearestGridY + options.hourStart)
                );

            if (nearestGridY == options.hourEnd) {
                nearestGridTimeY.addSeconds(-1);
            }

            return util.extend({
                target: mouseEvent.target || mouseEvent.srcElement,
                relatedView: timeView,
                originEvent: mouseEvent,
                mouseY: mouseY,
                gridY: gridY,
                timeY: timeY,
                nearestGridY: nearestGridY,
                nearestGridTimeY: nearestGridTimeY,
                triggerEvent: mouseEvent.type
            }, extend);
        }, this);
    },

    /**
     * Get function to makes event data from Time and mouseEvent
     * @param {Time} timeView - Instance of time view.
     * @param {number} xIndex - Time view index
     * @returns {function} - Function that return event data from mouse event.
     */
    _retriveScheduleDataFromDate: function(timeView) {
        var self = this,
            viewTime = timeView.getDate(),
            options = timeView.options;

        /**
         * @param {TZDate} startDate - start date
         * @param {TZDate} endDate - end date
         * @param {number} hourStart Can limit of render hour start.
         * @returns {object} - common event data for time.*
         */
        return util.bind(function(startDate, endDate, hourStart) {
            var gridY, timeY, nearestGridY, nearestGridTimeY, nearestGridEndY, nearestGridEndTimeY;
            gridY = startDate.getHours() - hourStart + self._getNearestHour(startDate.getMinutes(), options.minuteCell, options.ratioHourGridY);
            timeY = new TZDate(viewTime).addMinutes(datetime.minutesFromHours(gridY));
            nearestGridY = gridY;
            nearestGridEndY = endDate.getHours() - hourStart + self._getNearestHour(endDate.getMinutes(), options.minuteCell, options.ratioHourGridY);
            nearestGridTimeY = new TZDate(viewTime).addMinutes(datetime.minutesFromHours(nearestGridY));
            nearestGridEndTimeY = new TZDate(viewTime).addMinutes(datetime.minutesFromHours(nearestGridEndY));

            return util.extend({
                target: timeView,
                relatedView: timeView,
                gridY: gridY,
                timeY: timeY,
                nearestGridY: nearestGridY,
                nearestGridTimeY: nearestGridTimeY,
                nearestGridEndY: nearestGridEndY,
                nearestGridEndTimeY: nearestGridEndTimeY,
                triggerEvent: 'manual',
                hourStart: hourStart
            });
        }, this);
    },

    /**
     * Mixin method.
     * @param {(TimeCreation|TimeMove)} obj - Constructor functions
     */
    mixin: function(obj) {
        var proto = obj.prototype;
        util.forEach(timeCore, function(method, methodName) {
            if (methodName === 'mixin') {
                return;
            }

            proto[methodName] = method;
        });
    }
};

module.exports = timeCore;
