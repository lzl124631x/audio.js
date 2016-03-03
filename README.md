我还在持续做微信JSSDK录音方面的开发, 欢迎大家使用audio.js并提出宝贵意见, 我会尽快给大家反馈!  
个人觉得recorder.js还不是很好用. 如果有人发现了比recorder.js更好用的HTML5录音js, 欢迎推荐.
#audio.js要解决的问题是?
微信JSSDK为前端提供了一些与NativeApp交互的接口, 如通过图像接口可以拍照或访问手机相册, 通过音频接口可以录音.

我在做关于音频接口的开发过程中遇到了几个问题:  
1. 如何结合Desktop测试和微信客户端测试? 即大多数开发的时候在Desktop上通过Chrome录音, 而通过微信客户端访问WebApp时就调用微信JSSDK录音.  
2. 微信JSSDK的录音模块有BUG.  
3. 微信JSSDK提供的处理方式都是都是通过回调函数实现的, 会导致函数嵌套较多. 无法支持异步的promise模式.

因此, 我在微信JSSDK的音频接口上又封装了一层, 使它:  
1. 兼顾Desktop和微信调试.  
2. 绕过微信JSSDK的BUG, 让录音操作更加Robust, 快速连按不易出错.  
3. 既支持回调函数, 又支持异步的promise模式.

于是就有了audio.js.

#API
以下API的option均接受`success`, `fail`和`complete`三个callback, 作用与微信JSSDK中的描述一致.

相应地, 你还可以用jQuery Promise中的`done`, `fail`, `always`和`then`挂上callback.

示例:
```
audio.startRecord({
  success: function() { console.log('This is a success callback.'); },
  fail: function() { console.log('This is a fail callback.'); },
  complete: function() { console.log('This is a complete callback.'); }
})
.done(function() { console.log('This is another success callback.'); });
.fail(function() { console.log('This is another fail callback.'); })
.always(function() { console.log('This is another complete callback.'); })
```

##startRecord
`onRecordTimeout`: 当录音超时时的callback. 在微信中, 录音时限为1分钟, 此callback相当于`wx.onVoiceRecordEnd`中注册的callback. 在Desktop上*暂时*忽略这个callback.

示例:
```
audio.startRecord({
  // other callbacks...
  onRecordTimeout: function() { console.log('Recording is timeout.'); }
});
```
##stopRecord
示例:
```
audio.stopRecord()
.done(function(res) {
  console.log(res.localId);
})
.fail(function(res) {
  console.log(res.errMsg);
})
```
##uploadVoice
示例:
```
audio.stopRecord()
.then(function(res) {
  res.isShowProgressTips = 0; // Hide the progress tips in WeChat.
  return audio.uploadVoice(res);
})
.done(function(res) {
  console.log(res.localId);
  if (res.isFromWeChat) {
  	console.log(res.serverId);
  } else {
  	console.log(res.binary);
  }
})
```
##playRecord
`localId`: `stopRecord`或`uploadVoice`返回的`localId`.  
`onPlayEnd`: 当播放录音结束时的callback. 在微信中, 相当于`wx.onVoicePlayEnd`中注册的callback.

示例:
```
audio.playRecord({
    localId: self.localId,
    success: function () { console.log('Record starts playing.'); },
    onPlayEnd: function () { console.log('Record ends playing.'); }
});
```
##stopPlayRecord
`localId`: `stopRecord`或`uploadVoice`返回的`localId`.

示例:
```
audio.stopPlayRecord({
  localId: self.localId
});
```

#依赖
1. jquery: 用到了jquery的异步接口deferred, promise. 还有一小部分是用来在Desktop上播放录音用.
2. 微信JSSDK: 在微信客户端上, audio.js会调用微信JSSDK提供的音频接口
3. recorder.js和recorderWorder.js: 在Desktop上, audio.js会调用[recorder.js](https://github.com/mattdiamond/Recorderjs)提供的录音接口.

注: [这](https://webaudiodemos.appspot.com/AudioRecorder/index.html)是recorderjs的Demo页面. 从源代码里我找到的[recorder.js](https://webaudiodemos.appspot.com/AudioRecorder/js/recorderjs/recorder.js)和[recorderWorker.js](https://webaudiodemos.appspot.com/AudioRecorder/js/recorderjs/recorderWorker.js). 但是recorder.js的[Github页面](https://github.com/mattdiamond/Recorderjs)上只能看到recorder.js, 看不到recorderWorker.js. [Issue #154](https://github.com/mattdiamond/Recorderjs/issues/154)问了这个问题, 还未收到回复.

#注意事项
1. Chrome不允许本地文件`file:///`开启录音功能, 参见[Chrome getUserMedia Not Requesting Permission Locally](https://stackoverflow.com/questions/13723699/chrome-getusermedia-not-requesting-permission-locally#). 想Desktop测试录音功能, 需要通过本地服务器访问index.html.
我尝试了`--allow-file-access-from-files`但是并没有起作用.
2. 如果你的WebApp部署在服务器上, 请用`https`. 否则Chrome会报错:

>getUserMedia() no longer works on insecure origins. To use this feature, you should consider switching your application to a secure origin, such as HTTPS. See https://goo.gl/rStTGz for more details.


#微信JSSDK音频接口的BUG
以下测试都在iPhone 6 Plus上进行.

1. startRecord后, 从屏幕底部上划打开iPhone的设置菜单, 再关闭菜单. 进入**假死状态**.

2. startRecord后, 点击主菜单按钮退回主菜单, 在退出过程中会观察到屏幕上方有红色的banner, 显示"微信"两个字, 是正在录音的意思. 但是一旦退回主菜单之后, 那个红色的banner就会消失.  
重新进入微信, 此时进入**假死状态**.

所谓的**假死状态**是指, 微信显示"录音中", 但是其实并没有在录音.  
此时startRecord会失败, errMsg: fail. stopRecord之后不会触发callback, 而且仍然显示"录音中".  
要想重新录音, 必须要stopRecord一次 (这次录音是失败的), 然后再依次startRecord, endRecord才可以.

##不startRecord, 直接endRecord有什么效果?
我的测试结果是, 三个callback都不会被触发(但是我怎么记得以前会显示NotRecording…)!

我觉得这应该算是一个bug, 如果没有在录音但是调用了endRecord, 那应该fail并且errMsg为NotRecording.

#录音后播放audio声音变得特别小
微信JSSDK在iPhone上有个bug: 录音之后, 播放声音(如audio, video)都会通过听筒(earphone. 如果没插耳机, 就是通过iPhone上部的听筒; 否则就是通过耳机), 而不是外放(speaker), **如果你用外放的话这会让你感觉声音变小了很多**; 如果你用耳机的话, 这不会产生影响.

我的解决方法是: 每次录音结束(`stopRecord`)之后立即调用`playRecord`和`stopPlayRecord`, 因为我发现`playRecord`一次后声音就正常地从外放播放出来了.

#License (MIT)
Copyright © 2016 Richard Liu

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
#TODO
- [ ] 完善文档
- [ ] 目前只支持Requirejs方式
- [ ] 加上pauseRecord? 如果有人需要的话.
