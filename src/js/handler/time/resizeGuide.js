/**
 * @fileoverview Module for Time.Resize effect while dragging.
 * @author NHN FE Development Lab <dl_javascript@nhn.com>
 */
'use strict';

var util = require('tui-code-snippet');
var config = require('../../config');
var domutil = require('../../common/domutil');
var reqAnimFrame = require('../../common/reqAnimFrame');
var ratio = require('../../common/common').ratio;

/**
 * Class for Time.Resize effect.
 * @constructor
 * @param {TimeResize} timeResize - the instance of TimeResize handler.
 */
function TimeResizeGuide(timeResize) {
    /**
     * @type {HTMLElement}
     */
    this.guideElement = null;

    /**
     * @type {TimeResize}
     */
    this.timeResize = timeResize;

    /**
     * @type {function}
     */
    this._getTopFunc = null;

    /**
     * @type {HTMLElement}
     */
    this._originScheduleElement = null;

    /**
     * @type {number}
     */
    this._startTopPixel = 0;

    /**
     * @type {number}
     */
    this._startHeightPixel = 0;

    /**
     * @type {number}
     */
    this._startGridY = 0;

    /**
     * @type {Schedule}
     */
    this._schedule = null;
    
    this._dragStart = null;

    timeResize.on({
        'timeResizeDragstart': this._onDragStart,
        'timeResizeDrag': this._onDrag,
        'timeResizeDragend': this._onDragEnd
        // 'timeResizeClick': this._clearGuideElement
    }, this);
}

/**
 * Destroy method
 */
TimeResizeGuide.prototype.destroy = function() {
    this._clearGuideElement();
    this.timeResize.off(this);
    this.guideElement = this.timeResize = this._getTopFunc =
        this._originScheduleElement = this._startHeightPixel =
        this._startGridY = this._startTopPixel = null;
};

/**
 * Clear guide element.
 */
TimeResizeGuide.prototype._clearGuideElement = function() {
    var guideElement = this.guideElement,
        originElement = this._originScheduleElement;

    if (!util.browser.msie) {
        domutil.removeClass(global.document.body, config.classname('resizing'));
    }

    if (originElement) {
        originElement.style.display = 'block';
    }

    domutil.remove(guideElement);

    this.guideElement = this._getTopFunc = this._originScheduleElement =
        this._startHeightPixel = this._startGridY = this._startTopPixel = null;
};

/**
 * Refresh guide element
 * @param {number} guideHeight - guide element's style height.
 * @param {number} minTimeHeight - time element's min height
 * @param {number} timeHeight - time element's height.
 */
TimeResizeGuide.prototype._refreshGuideElement = function(guideTop, guideHeight) {
    var guideElement = this.guideElement,
        timeElement;

    if (!guideElement) {
        return;
    }

    timeElement = domutil.find(config.classname('.time-schedule-content-time'), guideElement);

    reqAnimFrame.requestAnimFrame(function() {
        if (guideTop !== null) {
            guideElement.style.top = guideTop + 'px';
        }
        guideElement.style.height = guideHeight + 'px';
        guideElement.style.display = 'block';

        if (timeElement) {
            timeElement.style.height = guideHeight + 'px';
            timeElement.style.minHeight = guideHeight + 'px';
        }
    });
};

/**
 * TimeMove#timeMoveDragstart event handler
 * @param {object} dragStartEventData - dragstart event data
 */
TimeResizeGuide.prototype._onDragStart = function(dragStartEventData) {
    var originElement = domutil.closest(
            dragStartEventData.target,
            config.classname('.time-date-schedule-block')
        ),
        schedule = dragStartEventData.schedule,
        guideElement;

    if (!util.browser.msie) {
        domutil.addClass(global.document.body, config.classname('resizing'));
    }

    if (!originElement || !schedule) {
        return;
    }
    this._dragStart = dragStartEventData;
    this._startGridY = dragStartEventData.nearestGridY;
    this._startHeightPixel = parseFloat(originElement.style.height);
    this._startTopPixel = parseFloat(originElement.style.top);

    this._originScheduleElement = originElement;
    this._schedule = schedule;

    guideElement = this.guideElement = originElement.cloneNode(true);
    domutil.addClass(guideElement, config.classname('time-guide-resize'));

    originElement.style.display = 'none';
    dragStartEventData.relatedView.container.appendChild(guideElement);
};

/**
 * @param {object} dragEventData - event data from Drag#drag.
 */
TimeResizeGuide.prototype._onDrag = function(dragEventData) {
    var timeView = dragEventData.relatedView,
        viewOptions = timeView.options,
        viewHeight = timeView.getViewBound().height,
        hourLength = viewOptions.hourEnd - viewOptions.hourStart,
        guideElement = this.guideElement,
        gridYOffset = dragEventData.nearestGridY - this._startGridY,
        gridYOffsetPixel = ratio(hourLength, viewHeight, gridYOffset),
        gridRange = this.timeResize._getDragGrid(),
        guideTop,
        minTop,
        maxTop,
        minHeight,
        maxHeight,
        top = null,
        height = this._startHeightPixel + gridYOffsetPixel;

    if (domutil.hasClass(this._dragStart.target, config.classname('time-top-resize-handle'))) {
        minTop = 0;
        maxTop = gridRange.nearestGridEndY - viewOptions.ratioHourGridY[1];
        
        guideTop = dragEventData.nearestGridY;
        guideTop = Math.max(guideTop, minTop);
        guideTop = Math.min(guideTop, maxTop);

        top = ratio(hourLength, viewHeight, guideTop);
        height = this._startHeightPixel + ratio(hourLength, viewHeight, this._startGridY - dragEventData.nearestGridY);
        this._refreshGuideElement(top, height);
    } else if (domutil.hasClass(this._dragStart.target, config.classname('time-bottom-resize-handle'))) {
        guideTop = parseFloat(guideElement.style.top);

        // at least large than xx min from schedule start time.
        minHeight = ratio(hourLength, viewHeight, viewOptions.ratioHourGridY[1]);
        maxHeight = viewHeight - guideTop;

        height = this._startHeightPixel + ratio(hourLength, viewHeight, dragEventData.nearestGridY - this._startGridY);

        height = Math.max(height, minHeight);
        height = Math.min(height, maxHeight);

        this._refreshGuideElement(top, height);
    }
};

/**
 * @param {object} dragEventData - event data from Drag#drag.
 */
TimeResizeGuide.prototype._onDragEnd = function(dragEventData) {
    if (!util.browser.msie) {
        domutil.removeClass(global.document.body, config.classname('resizing'));
    }
};

module.exports = TimeResizeGuide;
