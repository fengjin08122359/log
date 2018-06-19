/* FileSaver.js
 *  A saveAs() & saveTextAs() FileSaver implementation.
 *  2014-06-24
 *
 *  Modify by Brian Chen
 *  Author: Eli Grey, http://eligrey.com
 *  License: X11/MIT
 *    See https://github.com/eligrey/FileSaver.js/blob/master/LICENSE.md
 */

/*global self */
/*jslint bitwise: true, indent: 4, laxbreak: true, laxcomma: true, smarttabs: true, plusplus: true */

/*! @source http://purl.eligrey.com/github/FileSaver.js/blob/master/FileSaver.js */

var saveAs = saveAs
  // IE 10+ (native saveAs)
  || (typeof navigator !== "undefined" &&
      navigator.msSaveOrOpenBlob && navigator.msSaveOrOpenBlob.bind(navigator))
  // Everyone else
  || (function (view) {
      "use strict";
      // IE <10 is explicitly unsupported
      if (typeof navigator !== "undefined" &&
          /MSIE [1-9]\./.test(navigator.userAgent)) {
          return;
      }
      var
            doc = view.document
            // only get URL when necessary in case Blob.js hasn't overridden it yet
          , get_URL = function () {
              return view.URL || view.webkitURL || view;
          }
          , save_link = doc.createElementNS("http://www.w3.org/1999/xhtml", "a")
          , can_use_save_link = !view.externalHost && "download" in save_link
          , click = function (node) {
              var event = doc.createEvent("MouseEvents");
              event.initMouseEvent(
                  "click", true, false, view, 0, 0, 0, 0, 0
                  , false, false, false, false, 0, null
              );
              node.dispatchEvent(event);
          }
          , webkit_req_fs = view.webkitRequestFileSystem
          , req_fs = view.requestFileSystem || webkit_req_fs || view.mozRequestFileSystem
          , throw_outside = function (ex) {
              (view.setImmediate || view.setTimeout)(function () {
                  throw ex;
              }, 0);
          }
          , force_saveable_type = "application/octet-stream"
          , fs_min_size = 0
          , deletion_queue = []
          , process_deletion_queue = function () {
              var i = deletion_queue.length;
              while (i--) {
                  var file = deletion_queue[i];
                  if (typeof file === "string") { // file is an object URL
                      get_URL().revokeObjectURL(file);
                  } else { // file is a File
                      file.remove();
                  }
              }
              deletion_queue.length = 0; // clear queue
          }
          , dispatch = function (filesaver, event_types, event) {
              event_types = [].concat(event_types);
              var i = event_types.length;
              while (i--) {
                  var listener = filesaver["on" + event_types[i]];
                  if (typeof listener === "function") {
                      try {
                          listener.call(filesaver, event || filesaver);
                      } catch (ex) {
                          throw_outside(ex);
                      }
                  }
              }
          }
          , FileSaver = function (blob, name) {
              // First try a.download, then web filesystem, then object URLs
              var
                    filesaver = this
                  , type = blob.type
                  , blob_changed = false
                  , object_url
                  , target_view
                  , get_object_url = function () {
                      var object_url = get_URL().createObjectURL(blob);
                      deletion_queue.push(object_url);
                      return object_url;
                  }
                  , dispatch_all = function () {
                      dispatch(filesaver, "writestart progress write writeend".split(" "));
                  }
                  // on any filesys errors revert to saving with object URLs
                  , fs_error = function () {
                      // don't create more object URLs than needed
                      if (blob_changed || !object_url) {
                          object_url = get_object_url(blob);
                      }
                      if (target_view) {
                          target_view.location.href = object_url;
                      } else {
                          window.open(object_url, "_blank");
                      }
                      filesaver.readyState = filesaver.DONE;
                      dispatch_all();
                  }
                  , abortable = function (func) {
                      return function () {
                          if (filesaver.readyState !== filesaver.DONE) {
                              return func.apply(this, arguments);
                          }
                      };
                  }
                  , create_if_not_found = { create: true, exclusive: false }
                  , slice
              ;
              filesaver.readyState = filesaver.INIT;
              if (!name) {
                  name = "download";
              }
              if (can_use_save_link) {
                  object_url = get_object_url(blob);
                  save_link.href = object_url;
                  save_link.download = name;
                  click(save_link);
                  filesaver.readyState = filesaver.DONE;
                  dispatch_all();
                  return;
              }
              // Object and web filesystem URLs have a problem saving in Google Chrome when
              // viewed in a tab, so I force save with application/octet-stream
              // http://code.google.com/p/chromium/issues/detail?id=91158
              if (view.chrome && type && type !== force_saveable_type) {
                  slice = blob.slice || blob.webkitSlice;
                  blob = slice.call(blob, 0, blob.size, force_saveable_type);
                  blob_changed = true;
              }
              // Since I can't be sure that the guessed media type will trigger a download
              // in WebKit, I append .download to the filename.
              // https://bugs.webkit.org/show_bug.cgi?id=65440
              if (webkit_req_fs && name !== "download") {
                  name += ".download";
              }
              if (type === force_saveable_type || webkit_req_fs) {
                  target_view = view;
              }
              if (!req_fs) {
                  fs_error();
                  return;
              }
              fs_min_size += blob.size;
              req_fs(view.TEMPORARY, fs_min_size, abortable(function (fs) {
                  fs.root.getDirectory("saved", create_if_not_found, abortable(function (dir) {
                      var save = function () {
                          dir.getFile(name, create_if_not_found, abortable(function (file) {
                              file.createWriter(abortable(function (writer) {
                                  writer.onwriteend = function (event) {
                                      target_view.location.href = file.toURL();
                                      deletion_queue.push(file);
                                      filesaver.readyState = filesaver.DONE;
                                      dispatch(filesaver, "writeend", event);
                                  };
                                  writer.onerror = function () {
                                      var error = writer.error;
                                      if (error.code !== error.ABORT_ERR) {
                                          fs_error();
                                      }
                                  };
                                  "writestart progress write abort".split(" ").forEach(function (event) {
                                      writer["on" + event] = filesaver["on" + event];
                                  });
                                  writer.write(blob);
                                  filesaver.abort = function () {
                                      writer.abort();
                                      filesaver.readyState = filesaver.DONE;
                                  };
                                  filesaver.readyState = filesaver.WRITING;
                              }), fs_error);
                          }), fs_error);
                      };
                      dir.getFile(name, { create: false }, abortable(function (file) {
                          // delete file if it already exists
                          file.remove();
                          save();
                      }), abortable(function (ex) {
                          if (ex.code === ex.NOT_FOUND_ERR) {
                              save();
                          } else {
                              fs_error();
                          }
                      }));
                  }), fs_error);
              }), fs_error);
          }
          , FS_proto = FileSaver.prototype
          , saveAs = function (blob, name) {
              return new FileSaver(blob, name);
          }
      ;
      FS_proto.abort = function () {
          var filesaver = this;
          filesaver.readyState = filesaver.DONE;
          dispatch(filesaver, "abort");
      };
      FS_proto.readyState = FS_proto.INIT = 0;
      FS_proto.WRITING = 1;
      FS_proto.DONE = 2;

      FS_proto.error =
      FS_proto.onwritestart =
      FS_proto.onprogress =
      FS_proto.onwrite =
      FS_proto.onabort =
      FS_proto.onerror =
      FS_proto.onwriteend =
          null;

      view.addEventListener("unload", process_deletion_queue, false);
      saveAs.unload = function () {
          process_deletion_queue();
          view.removeEventListener("unload", process_deletion_queue, false);
      };
      return saveAs;
  }(
	   typeof self !== "undefined" && self
	|| typeof window !== "undefined" && window
	|| this.content
));
// `self` is undefined in Firefox for Android content script context
// while `this` is nsIContentFrameMessageManager
// with an attribute `content` that corresponds to the window

if (typeof module !== "undefined" && module !== null) {
    module.exports = saveAs;
} else if ((typeof define !== "undefined" && define !== null) && (define.amd != null)) {
    define([], function () {
        return saveAs;
    });
}

String.prototype.endsWithAny = function () {
    var strArray = Array.prototype.slice.call(arguments),
        $this = this.toLowerCase().toString();
    for (var i = 0; i < strArray.length; i++) {
        if ($this.indexOf(strArray[i], $this.length - strArray[i].length) !== -1) return true;
    }
    return false;
};

var saveTextAs = saveTextAs
|| (function (textContent, fileName, charset) {
    fileName = fileName || 'download.txt';
    charset = charset || 'utf-8';
    textContent = (textContent || '').replace(/\r?\n/g, "\r\n");
    if (saveAs && Blob) {
        var blob = new Blob([textContent], { type: "text/plain;charset=" + charset });
        saveAs(blob, fileName);
        return true;
    } else {//IE9-
        var saveTxtWindow = window.frames.saveTxtWindow;
        if (!saveTxtWindow) {
            saveTxtWindow = document.createElement('iframe');
            saveTxtWindow.id = 'saveTxtWindow';
            saveTxtWindow.style.display = 'none';
            document.body.insertBefore(saveTxtWindow, null);
            saveTxtWindow = window.frames.saveTxtWindow;
            if (!saveTxtWindow) {
                saveTxtWindow = window.open('', '_temp', 'width=100,height=100');
                if (!saveTxtWindow) {
                    window.alert('Sorry, download file could not be created.');
                    return false;
                }
            }
        }

        var doc = saveTxtWindow.document;
        doc.open('text/html', 'replace');
        doc.charset = charset;
        if (fileName.endsWithAny('.htm', '.html')) {
            doc.close();
            doc.body.innerHTML = '\r\n' + textContent + '\r\n';
        } else {
            if (!fileName.endsWithAny('.txt')) fileName += '.txt';
            doc.write(textContent);
            doc.close();
        }

        var retValue = doc.execCommand('SaveAs', null, fileName);
        saveTxtWindow.close();
        return retValue;
    }
})
/*log.js 日志*/
var stringify=function(){function a(a){return/["\\\x00-\x1f]/.test(a)&&(a=a.replace(/["\\\x00-\x1f]/g,function(a){var b=e[a];return b?b:(b=a.charCodeAt(),"\\u00"+Math.floor(b/16).toString(16)+(b%16).toString(16))})),'"'+a+'"'}function b(a){var b,c,d,e=["["],f=a.length;for(c=0;f>c;c++)switch(d=a[c],typeof d){case"undefined":case"function":case"unknown":break;default:b&&e.push(","),e.push(stringify(d)),b=1}return e.push("]"),e.join("")}function c(a){return 10>a?"0"+a:a}function d(a){return'"'+a.getFullYear()+"-"+c(a.getMonth()+1)+"-"+c(a.getDate())+"T"+c(a.getHours())+":"+c(a.getMinutes())+":"+c(a.getSeconds())+'"'}var e={"\b":"\\b","       ":"\\t","\n":"\\n","\f":"\\f","\r":"\\r",'"':'\\"',"\\":"\\\\"};return function(c){switch(typeof c){case"undefined":return"undefined";case"number":return isFinite(c)?String(c):"null";case"string":return a(c);case"boolean":return String(c);default:if(null===c)return"null";if(c instanceof Array)return b(c);if(c instanceof Date)return d(c);var e,f,g=["{"],h=stringify;for(var i in c)if(Object.prototype.hasOwnProperty.call(c,i))switch(f=c[i],typeof f){case"undefined":case"unknown":case"function":break;default:e&&g.push(","),e=1,g.push(h(i)+":"+h(f))}return g.push("}"),g.join("")}}}();
if(/* @cc_on!@ */0){
    JSON = {
       parse: function(b) {
         return (new Function("return " + b))()
       },
       stringify: stringify
    };
  }else{
    JSON = {
        parse: window.JSON && (window.JSON.parse || window.JSON.decode) || String.prototype.evalJSON &&
            function(str) {
                return String(str).evalJSON();
            } || $.parseJSON || $.evalJSON,
        stringify: Object.toJSON || window.JSON && (window.JSON.stringify || window.JSON.encode) || stringify
    };
  };
  Date.prototype.Format = function (fmt) { //author: meizz 
	    var o = {
	        "M+": this.getMonth() + 1, //月份 
	        "d+": this.getDate(), //日 
	        "h+": this.getHours(), //小时 
	        "m+": this.getMinutes(), //分 
	        "s+": this.getSeconds(), //秒 
	        "q+": Math.floor((this.getMonth() + 3) / 3), //季度 
	        "S": this.getMilliseconds() //毫秒 
	    };
	    if (/(y+)/.test(fmt)) fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
	    for (var k in o)
	    if (new RegExp("(" + k + ")").test(fmt)) fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
	    return fmt;
	};
	if(typeof Object.getOwnPropertyNames=="undefined"){
		Object.getOwnPropertyNames = function(item){
			var arr = [];
			for(var i in item){
				arr.push(i);
			}
			return arr;
		}
	}
	JSON = {
      parse: window.JSON && (window.JSON.parse || window.JSON.decode) || String.prototype.evalJSON && function(a) {
        return String(a).evalJSON()
      } || $.parseJSON || $.evalJSON,
      stringify: Object.toJSON || window.JSON && (window.JSON.stringify || window.JSON.encode) || stringify
    };
    if (!Array.prototype.indexOf) {
      Array.prototype.indexOf = function(elt) {
        var len = this.length >>> 0;
        var from = Number(arguments[1]) || 0;
        from = (from < 0) ? Math.ceil(from) : Math.floor(from);
        if (from < 0) from += len;
        for (; from < len; from++) {
          if (from in this && this[from] === elt) return from
        }
        return -1
      }
    };
   var arrayUnique = function (th) {
	  var n = []; //一个新的临时数组
	  for(var i = 0; i < th.length; i++) //遍历当前数组
	  {
	    if(n.indexOf(th[i]) == -1) n.push(th[i]);
	  }
	  return n;
	}; 
	if(typeof console =="undefined"){
		console = {};
		console.log=function(e){};
		console.warn=function(e){};
		console.error=function(e){};
		console.debug=function(e){};
	};
	function HTMLDecode(text) {
	    var temp = document.createElement("div");
	    temp.innerHTML = text;
	    var output = temp.innerText || temp.textContent;
	    temp = null;
	    return output;
	};
	function HTMLEncode(html) {
	    var temp = document.createElement("div");
	    (temp.textContent != null) ? (temp.textContent = html) : (temp.innerText = html);
	    var output = temp.innerHTML;
	    temp = null;
	    return output;
	};
	(function($) {
    $.fn.jqDrag = function(h) {
      return i(this, h, 'd');
    };
    $.fn.jqResize = function(h) {
      return i(this, h, 'r');
    };
    $.jqDnR = {
      dnr : {},
      e : 0,
      drag : function(v) {
        if (M.k == 'd')
          E.css( {
            left : M.X + (v.pageX || v.originalEvent.touches[0].pageX || 0) - M.pX,
            top : M.Y + (v.pageY || v.originalEvent.touches[0].pageY || 0) - M.pY
          });
        else
          E.css( {
            width : Math.max(v.pageX - M.pX + M.W, 0),
            height : Math.max(v.pageY - M.pY + M.H, 0)
          });
        var event = arguments[0]||window.event;
        if( event.stopPropagation ) { event.stopPropagation(); } //For 'Good' browsers
        else { event.cancelBubble = true; } //For IE
        return false;
      },
      stop : function() {
        E.removeClass("transparent");
        $(this).unbind('touchmove mousemove', J.drag).unbind('touchend mouseup', J.stop);
      }
    };
    var J = $.jqDnR, M = J.dnr, E = J.e, i = function(e, h, k) {
      return e.each(function() {
        h = (h) ? $(h, e) : e;
        h.bind('touchstart mousedown', {
          e : e,
          k : k
        }, function(v) {
          var d = v.data, p = {};
          E = d.e;
          if (E.css('position') != 'relative') {
            try {
              E.position(p);
            } catch (e) {
            }
          }
          M = {
            X : p.left || f('left') || 0,
            Y : p.top || f('top') || 0,
            W : f('width') || E[0].scrollWidth || 0,
            H : f('height') || E[0].scrollHeight || 0,
            pX : (v.pageX || v.originalEvent.touches[0].pageX || 0),
            pY : (v.pageY || v.originalEvent.touches[0].pageY || 0),
            k : d.k,
            o : E.css('opacity')
          };
//          E.css( {
//            opacity : 0.8
//          });
          E.addClass("transparent");
          $(this).on("touchmove mousemove",$.jqDnR.drag).on("touchend mouseup",$.jqDnR.stop);
          var event = arguments[0]||window.event;
          if( event.stopPropagation ) { event.stopPropagation(); } //For 'Good' browsers
          else { event.cancelBubble = true; } //For IE
          return true;
        });
      });
    }, f = function(k) {
      return parseInt(E.css(k)) || false;
    };
  })(jQuery);
(function(window, $, undefined) {
	var LOG = function(options) {
		this.defaults = {
		    bgColor: 'rgba(0,0,0,0.3)',
		    time:2,
		    maxLength:100000,
		    downloadJsp:"",
		    css:""
		},
		this.options = $.extend({}, this.defaults, options)
	};
	LOG.prototype = {
		index:0,
		control:0,zoom:1,close:0,
		logArray:[],
		from:["all"],
		curFrom:0,
		init:function(){
		  this.insertStyle(".logBox{position:fixed;top:0;left:0;width:60%;height:60%;background:#fff;border:1px solid #000;border-radius:5px;z-index:1000000;display:none;cursor:move}.logBox .tools{position:absolute;top:0;width:80%;height:20px;margin:10px 10%}.logBox .list{position:absolute;top:40px;width:100%;bottom:0;overflow-x:hidden;overflow-y:auto;word-break:break-all}.logBox .tools span{width:20%;box-sizing:border-box;display:inline-block;text-align:center;line-height:20px;background:#e1e1e1;cursor:pointer}.logBoxcol{background:#333;color:#fff}.logBoxcol:nth-child(even){background:#fff;color:#333}")
			var l =this;
	  		$(window).error(function(msg, url, line){
	  			if(msg && msg.originalEvent){
	  				console.log("错误信息：" , msg.originalEvent.message);
	  		       console.log("出错文件：" , msg.originalEvent.filename);
	  		       console.log("出错行号：" , msg.originalEvent.lineno);
	  		       console.log("出错列号：" , msg.originalEvent.colno);
	  			}
	  		});
			if($(".logBox").length>0)return;
			$("body").append("<div class='logBox'></div>");
			$(".logBox").append("<div class='tools'><span class='control'>暂停</span><span class='zoom'>缩小</span><span class='from'>all</span><span class='copy'>导出</span><span class='closebtn'>关闭</span></div><div class='list'></div>");
			$('.logBox').jqDrag();
			$(".logBox .tools .control").on("click",function(){
				if(l.control==0){
					l.control = 1;
					$(".logBox .tools .control").html("开始");
				}else{
					$(".logBox .tools .control").html("暂停");
					l.control = 0;
					l.reuse();
				}
			})
			$(".logBox .tools .zoom").on("click",function(){
				if(l.zoom==0){
					l.zoom = 1;
					$(".logBox .tools .zoom").html("缩小");
					$(".logBox").height("60%");
					$(".logBox").width("60%");
				}else{
					$(".logBox .tools .zoom").html("放大");
					l.zoom = 0;
					$(".logBox").width("300px");
					$(".logBox").height("40px");
				}
			})
			$(".logBox .tools .copy").on("click",function(){
				l.saveAsFile();
			})
			$(".logBox .tools .from").on("click",function(){
				l.curFrom = (l.curFrom+1)%l.from.length;
				$(this).html(l.from[l.curFrom]);
				l.reuse();
			})
			$(".logBox .tools .closebtn").on("click",function(){
				l.hide();
			})
      this.show();
      console.log = function () {
          var s = [];
          for (var i = 0; i < arguments.length; i++) {
            if((typeof arguments[i]).toLowerCase() == "object"){

            }else if((typeof arguments[i]).toLowerCase() == "boolean"||(typeof arguments[i]).toLowerCase() == "number"||(typeof arguments[i]).toLowerCase() == "string"){
              s.push(arguments[i]);
            }
          }
          l.log("log",s.length==1?s:JSON.stringify(s));
      };
      console.warn = function () {
          var s = [];
          for (var i = 0; i < arguments.length; i++) {
            if((typeof arguments[i]).toLowerCase() == "object"){

            }else if((typeof arguments[i]).toLowerCase() == "boolean"||(typeof arguments[i]).toLowerCase() == "number"||(typeof arguments[i]).toLowerCase() == "string"){
              s.push(arguments[i]);
            }
          }
          l.log("warn",s.length==1?s:JSON.stringify(s));
      };
      console.error = function () {
          var s = [];
          for (var i = 0; i < arguments.length; i++) {
            if((typeof arguments[i]).toLowerCase() == "object"){

            }else if((typeof arguments[i]).toLowerCase() == "boolean"||(typeof arguments[i]).toLowerCase() == "number"||(typeof arguments[i]).toLowerCase() == "string"){
              s.push(arguments[i]);
            }
          }
          l.log("error",s.length==1?s:JSON.stringify(s));
      };
      console.debug = function () {
          var s = [];
          for (var i = 0; i < arguments.length; i++) {
            if((typeof arguments[i]).toLowerCase() == "object"){
              s.push(JSON.stringify(arguments[i]));
            }else{
              s.push(arguments[i]);
            }
          }
          l.log("debug",s.length==1?s:JSON.stringify(s));
      };
		},
		log:function(from,e){
			var time = new Date().Format("hh:mm:ss");
			var text = time+" "+from+" "+e+" time:"+new Date().getTime();
			try{
				text = decodeURIComponent(decodeURIComponent(HTMLEncode(text)));
			}catch(ex){}
			this.addCategory(from);
			this.logArray.push({time:time,from:from,text:HTMLEncode(text)});
			if(this.logArray.length>this.options.maxLength){
				this.logArray.shift();
			}
			if($('.logBox .list').length>0 && this.control==0 && this.close==1 && this.curShow(from)){
				$(".logBox .list").append('<div class="logBoxcol">'+HTMLEncode(text)+'</div>');
				$('.logBox .list')[0].scrollTop = $('.logBox .list')[0].scrollHeight;
			}
		},
		reuse:function(){
			var l = this;
			$(".logBox .list").html("");
      var html = "";
			for(var i=0,len=l.logArray.length;i<len;i++){
				if(l.curShow(l.logArray[i].from)){
					html +=('<div class="logBoxcol">'+l.logArray[i].text+'</div>');
				}
			}
      $(".logBox .list").append(html);
		},
		addCategory:function(from){
			var l = this;
			l.from =  arrayUnique(l.from.concat(from));
		},
		curShow:function(from){
			var l = this;
			return l.from[l.curFrom] == from ||l.from[l.curFrom] =="all";
		},
		hide:function(){
			if(this.close==1){
				this.close = 0;
				$(".logBox").hide();
			}
		},
		show:function(){
			if(this.close==0){
				this.close = 1;
				$(".logBox").show();
				this.reuse();
			}
		},saveAsFile:function(){
			var l = this;
      var content = l.getChatContent();
      var timeStr = new Date().getTime();
      var file = new Blob([content], { type: "text/plain;charset=utf-8" });
      saveTextAs(file, "日志记录"+timeStr+".txt");
		},getChatContent:function(){
			var l =this;
      var content = ''
			for (var i = 0, len = l.logArray.length; i < len; i++) {
        content += l.logArray[i].text + '\r\n'
      }
      return content;
		},insertStyle: function (str) {
	    var nod = document.createElement("style");  
	    nod.type="text/css";  
	    if(nod.styleSheet){         
	      nod.styleSheet.cssText = str;  
	    } else {  
	      nod.innerHTML = str;       
	    }  
	    document.getElementsByTagName("head")[0].appendChild(nod); 
	  }
	}
	$.log = function(options) {
		var log = new LOG(options);
    log.init();
		return log;
	}
})(window, jQuery);
