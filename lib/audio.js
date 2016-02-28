(function (undefined) {
    var window = this || (0, eval)('this'),
            $ = window["jQuery"],
            wx = window["wx"],
            recorder = window["recorder"];
    (function (factory) {
        // Support three module loading scenarios
        if (typeof define === 'function' && define['amd']) {
            // [1] AMD anonymous module
            define(['exports', 'require'], factory);
        } else if (typeof exports === 'object' && typeof module === 'object') {
            // [2] CommonJS/Node.js
            factory(module['exports'] || exports);  // module.exports is for Node.js
        } else {
            // [3] No module loader (plain <script> tag) - put directly in global namespace
            factory(window['audio'] = {});
        }
    }(function (audioExports) {
        'use strict';
        var self = typeof audioExports !== 'undefined' ? audioExports : {};

        function createDeferred(options) {
            var deferred = $.Deferred().done(options.success).fail(options.fail).always(options.complete);
            options.success = options.fail = options.complete = $.noop;
            return deferred;
        }

        // options:
        // * onRecordTimeout: a fuction to be called when recording is timeout.
        self.startRecord = function (options) {
            console.log('startRecord ----')
            options = $.extend({}, options);
            var deferred = createDeferred(options);

            if (self.canStartRecord) {
                self.canStartRecord = false;

                options.success = function (r) {
                    setTimeout(function () {
                        self.canStopRecord = true;
                    }, self.delaySetCanStopRecordTimeSpan);
                    deferred.resolve(r);
                };
                options.fail = function (r) {
                    deferred.reject(r);
                };
                options.complete = function () {
                    setTimeout(function () {
                        self.canStartRecord = true;
                    }, self.delaySetCanStartRecordTimeSpan);
                };
                self.rec.startRecord(options);
            } else {
                deferred.reject({ errMsg: 'startRecord: rejected by audio.js.' });
            }
            return deferred;
        }

        function stopRecord(deferred, options) {
            console.log('canStopRecord is ', self.canStopRecord);
            if (self.canStopRecord) {
                self.canStopRecord = false;
                options.success = function (r) {
                    deferred.resolve(r);
                    self.localId = r.localId;
                    self.stoppingRecord = false;
                    console.log('stopRecord success', JSON.stringify(r));
                    console.log();
                };
                options.fail = function (r) {
                    deferred.reject(r);
                    console.log('stopRecord fail', JSON.stringify(r));
                    if (/tooshort/.test(r.errMsg)) {
                        // On stopRecord failing, there are two possible errMsgs:
                        // 1. tooshort. The stopping succeeds, while WeChat regards this too-short
                        // recording as a failed recording.
                        // 2. fail. The stopping failed and the recording still goes on.
                        // the flat `canStartRecord` should only be set when the errMsg is tooshort.
                        self.stoppingRecord = false;
                    }
                };
                self.rec.stopRecord(options);
            } else {
                self.stoppingRecord = true;

                setTimeout(function () {
                    stopRecord(deferred, options);
                }, self.testCanStopRecordTimeSpan);
            }
        }

        self.stopRecord = function (options) {
            console.log('stopRecord ----')
            options = $.extend({}, options);
            var deferred = createDeferred(options);

            if (self.stoppingRecord) {
                deferred.reject({ errMsg: 'stopRecord: rejected by audio.js.' });
            } else {
                stopRecord(deferred, options);
            }
            return deferred;
        }

        self.uploadVoice = function (options) {
            options = $.extend({}, options);
            var deferred = createDeferred(options);
            options.success = function (r) {
                r.isFromWeChat = self.isFromWeChat;
                if (!self.isFromWeChat) {
                    r.binary = options.binary;
                }
                r.localId = options.localId;
                deferred.resolve(r);
            };
            options.fail = function (r) {
                deferred.reject(r);
            };
            self.rec.uploadVoice(options);
            return deferred;
        }

        self.playRecord = function (options) {
            options = $.extend({}, options);
            var deferred = createDeferred(options);
            options.success = function (r) {
                deferred.resolve(r);
            };
            options.fail = function (r) {
                deferred.reject(r);
            };
            self.rec.playRecord(options);
            return deferred;
        }

        self.stopPlayRecord = function (options) {
            options = $.extend({}, options);
            var deferred = createDeferred(options);
            options.success = function (r) {
                deferred.resolve(r);
            };
            options.fail = function (r) {
                deferred.reject(r);
            };
            self.rec.stopPlayRecord(options);
            return deferred;
        }

        //To fix the volume decrease after recording bug on iPhone
        function fixVolumnDecrease(options) {
            if (navigator.userAgent.match(/iPhone/i) != null) {
                self.playRecord({
                    localId: self.localId
                });
                self.stopPlayRecord({
                    localId: self.localId
                });
            }
        }

        function attachWeChatRecorder(self) {
            self.rec = {
                startRecord: function (options) {
                    var success = options.success;
                    options.success = function () {
                        wx.onVoiceRecordEnd({
                            complete: options.onRecordTimeout
                        });
                        success();
                    }
                    wx.startRecord(options);
                },
                stopRecord: wx.stopRecord,
                uploadVoice: wx.uploadVoice,
                playRecord: function (options) {
                    var success = options.success;
                    options.success = function () {
                        wx.onVoicePlayEnd({
                            complete: options.onPlayEnd
                        });
                        success();
                    }
                    wx.playVoice(options);
                },
                stopPlayRecord: wx.stopVoice
            };
        }

        function attachH5Recorder(self) {
            try {
                // webkit shim
                window.AudioContext = window.AudioContext || window.webkitAudioContext;
                navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia;
                window.URL = window.URL || window.webkitURL;

                var audio_context = new AudioContext;
                console.log('Audio context set up.');
                console.log('navigator.getUserMedia ' + (navigator.getUserMedia ? 'available.' : 'not present!'));
                navigator.getUserMedia({ audio: true },
                    function (stream) {
                        var input = audio_context.createMediaStreamSource(stream);
                        console.log('Media stream created.');

                        var rec = new Recorder(input, { workerPath: self.recorderWorkerPath });
                        rec.startRecord = function (options) {
                            rec.record();
                            options.success();
                            options.complete();
                        };
                        rec.stopRecord = function (options) {
                            rec.stop();
                            rec.exportWAV(function (blob) {
                                var localId = URL.createObjectURL(blob);
                                rec.localMap[localId] = blob;
                                var reader = new FileReader();
                                reader.onload = function () {
                                    var buf = new Uint8Array(this.result);
                                    var data = [];
                                    for (var i = 0; i < buf.length; ++i) {
                                        data.push(buf[i]);
                                    }
                                    var res = { localId: localId, binary: data, isFromWeChatServerId: false };
                                    options.success(res);
                                    options.complete(res);
                                };
                                reader.readAsArrayBuffer(blob);
                            });
                            rec.clear();
                        };
                        rec.uploadVoice = function (options) {
                            options.success({});
                        };
                        rec.playRecord = function (options) {
                            var au = $('<audio id="user-record" src="' + options.localId + '">');
                            au.appendTo('body');
                            au.trigger('play');
                            au.on('ended', options.onPlayEnd || $.noop)
                                .on('ended', function () { $(this).remove(); });
                            options.success();
                        };
                        rec.stopPlayRecord = function (options) {
                            $('#user-record').remove();
                            options.success();
                        };
                        rec.localMap = {};
                        self.rec = rec;
                        console.log('Recorder initialised.');
                    },
                    function (e) {
                        console.log('No live audio input: ' + e);
                        alert('没有检测到没有可用的音频输入设备!');
                    });
            } catch (e) {
                alert('No web audio support in this browser!');
            }
        }

        function getParameterByName(name) {
            name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
            var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
                results = regex.exec(location.search);
            return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
        };

        function init() {
            audioConfig = $.extend({}, audioConfig);
            self.recorderWorkerPath = audioConfig.recorderWorkerPath || 'recorderWorker.js';
            if (getParameterByName('code') || getParameterByName('wechat')) {
                // WeChat
                self.localId = null;
                attachWeChatRecorder(self);
                self.isFromWeChat = true;
            } else {
                // HTML5 Recorder
                attachH5Recorder(self);
                self.isFromWeChat = false;
            }
            // Initialize flags.
            self.canStartRecord = true; // True if this is the first call or the last stopRecord succeeded.
            self.canStopRecord = false;
            self.stoppingRecord = false;
            // `delaySetCanStartRecordTimeSpan` milliseconds after last startRecord succeeds,
            // the next startRecord is allowed.
            self.delaySetCanStartRecordTimeSpan = audioConfig.delaySetCanStartRecordTimeSpan || 1500;
            // Every `testCanStopRecordTimeSpan` milliseconds after stopRecord is called,
            // test if the flag `canStopRecord` is set to true.
            self.testCanStopRecordTimeSpan = audioConfig.testCanStopRecordTimeSpan || 500;
            // Set the `canStopRecord` flag to true after `delaySetCanStopRecordTimeSpan`
            // milliseconds after startRecord's success callback is done.
            self.delaySetCanStopRecordTimeSpan = audioConfig.delaySetCanStopRecordTimeSpan || 800;
        }

        init();
    }));
})();