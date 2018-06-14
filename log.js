/* FileSaver.js
 * A saveAs() FileSaver implementation.
 * 1.3.2
 * 2016-06-16 18:25:19
 *
 * By Eli Grey, http://eligrey.com
 * License: MIT
 *   See https://github.com/eligrey/FileSaver.js/blob/master/LICENSE.md
 */
 
/*global self */
/*jslint bitwise: true, indent: 4, laxbreak: true, laxcomma: true, smarttabs: true, plusplus: true */
 
/*! @source http://purl.eligrey.com/github/FileSaver.js/blob/master/FileSaver.js */
 
var saveAs = saveAs || (function(view) {
    "use strict";
    // IE <10 is explicitly unsupported
    if (typeof view === "undefined" || typeof navigator !== "undefined" && /MSIE [1-9]\./.test(navigator.userAgent)) {
        return;
    }
    var
          doc = view.document
          // only get URL when necessary in case Blob.js hasn't overridden it yet
        , get_URL = function() {
            return view.URL || view.webkitURL || view;
        }
        , save_link = doc.createElementNS("http://www.w3.org/1999/xhtml", "a")
        , can_use_save_link = "download" in save_link
        , click = function(node) {
            var event = new MouseEvent("click");
            node.dispatchEvent(event);
        }
        , is_safari = /constructor/i.test(view.HTMLElement) || view.safari
        , is_chrome_ios =/CriOS\/[\d]+/.test(navigator.userAgent)
        , throw_outside = function(ex) {
            (view.setImmediate || view.setTimeout)(function() {
                throw ex;
            }, 0);
        }
        , force_saveable_type = "application/octet-stream"
        // the Blob API is fundamentally broken as there is no "downloadfinished" event to subscribe to
        , arbitrary_revoke_timeout = 1000 * 40 // in ms
        , revoke = function(file) {
            var revoker = function() {
                if (typeof file === "string") { // file is an object URL
                    get_URL().revokeObjectURL(file);
                } else { // file is a File
                    file.remove();
                }
            };
            setTimeout(revoker, arbitrary_revoke_timeout);
        }
        , dispatch = function(filesaver, event_types, event) {
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
        , auto_bom = function(blob) {
            // prepend BOM for UTF-8 XML and text/* types (including HTML)
            // note: your browser will automatically convert UTF-16 U+FEFF to EF BB BF
            if (/^\s*(?:text\/\S*|application\/xml|\S*\/\S*\+xml)\s*;.*charset\s*=\s*utf-8/i.test(blob.type)) {
                return new Blob([String.fromCharCode(0xFEFF), blob], {type: blob.type});
            }
            return blob;
        }
        , FileSaver = function(blob, name, no_auto_bom) {
            if (!no_auto_bom) {
                blob = auto_bom(blob);
            }
            // First try a.download, then web filesystem, then object URLs
            var
                  filesaver = this
                , type = blob.type
                , force = type === force_saveable_type
                , object_url
                , dispatch_all = function() {
                    dispatch(filesaver, "writestart progress write writeend".split(" "));
                }
                // on any filesys errors revert to saving with object URLs
                , fs_error = function() {
                    if ((is_chrome_ios || (force && is_safari)) && view.FileReader) {
                        // Safari doesn't allow downloading of blob urls
                        var reader = new FileReader();
                        reader.onloadend = function() {
                            var url = is_chrome_ios ? reader.result : reader.result.replace(/^data:[^;]*;/, 'data:attachment/file;');
                            var popup = view.open(url, '_blank');
                            if(!popup) view.location.href = url;
                            url=undefined; // release reference before dispatching
                            filesaver.readyState = filesaver.DONE;
                            dispatch_all();
                        };
                        reader.readAsDataURL(blob);
                        filesaver.readyState = filesaver.INIT;
                        return;
                    }
                    // don't create more object URLs than needed
                    if (!object_url) {
                        object_url = get_URL().createObjectURL(blob);
                    }
                    if (force) {
                        view.location.href = object_url;
                    } else {
                        var opened = view.open(object_url, "_blank");
                        if (!opened) {
                            // Apple does not allow window.open, see https://developer.apple.com/library/safari/documentation/Tools/Conceptual/SafariExtensionGuide/WorkingwithWindowsandTabs/WorkingwithWindowsandTabs.html
                            view.location.href = object_url;
                        }
                    }
                    filesaver.readyState = filesaver.DONE;
                    dispatch_all();
                    revoke(object_url);
                }
            ;
            filesaver.readyState = filesaver.INIT;
 
            if (can_use_save_link) {
                object_url = get_URL().createObjectURL(blob);
                setTimeout(function() {
                    save_link.href = object_url;
                    save_link.download = name;
                    click(save_link);
                    dispatch_all();
                    revoke(object_url);
                    filesaver.readyState = filesaver.DONE;
                });
                return;
            }
 
            fs_error();
        }
        , FS_proto = FileSaver.prototype
        , saveAs = function(blob, name, no_auto_bom) {
            return new FileSaver(blob, name || blob.name || "download", no_auto_bom);
        }
    ;
    // IE 10+ (native saveAs)
    if (typeof navigator !== "undefined" && navigator.msSaveOrOpenBlob) {
        return function(blob, name, no_auto_bom) {
            name = name || blob.name || "download";
 
            if (!no_auto_bom) {
                blob = auto_bom(blob);
            }
            return navigator.msSaveOrOpenBlob(blob, name);
        };
    }
 
    FS_proto.abort = function(){};
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
 
    return saveAs;
}(
       typeof self !== "undefined" && self
    || typeof window !== "undefined" && window
    || this.content
));
// `self` is undefined in Firefox for Android content script context
// while `this` is nsIContentFrameMessageManager
// with an attribute `content` that corresponds to the window
 
if (typeof module !== "undefined" && module.exports) {
  module.exports.saveAs = saveAs;
} else if ((typeof define !== "undefined" && define !== null) && (define.amd !== null)) {
  define("FileSaver.js", function() {
    return saveAs;
  });
}
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
      var file = new File([content], "日志记录"+timeStr+".txt", { type: "text/plain;charset=utf-8" });
      saveAs(file);
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
