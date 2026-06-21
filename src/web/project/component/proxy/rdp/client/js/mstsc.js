import {Client} from "./client";
import {Canvas} from "./canvas";
import {KeyMap, UnicodeToCode} from "./keyboard";

function MstscClass() {
}

MstscClass.prototype = {
	$ : function (id) {
		return document.getElementById(id);
	},

	elementOffset : function (el) {
		var x = 0;
		var y = 0;
		while (el && !isNaN( el.offsetLeft ) && !isNaN( el.offsetTop )) {
			x += el.offsetLeft - el.scrollLeft;
			y += el.offsetTop - el.scrollTop;
			el = el.offsetParent;
		}
		return { top: y, left: x };
	},

	browser : function () {
		if (typeof InstallTrigger !== 'undefined') {
			return 'firefox';
		}
		if (!!window.chrome) {
			return 'chrome';
		}
		if (!!document.docuemntMode) {
			return 'ie';
		}
		return null;
	},

	locale : function () {
		return window.navigator.userLanguage || window.navigator.language;
	},
	client :{
		create : function (canvas) {
			return new Client(canvas);
		}
	},
	Canvas :{
		create : function (canvas) {
			return new Canvas(canvas);
		}
	},
	scancode (e) {
		var locale = MstscClass.prototype.locale();
		locale = (['fr', 'en'].indexOf(locale) > 0 && locale) || 'en';
		return KeyMap[e.code || UnicodeToCode[MstscClass.prototype.browser() || 'firefox'][locale][e.keyCode]];
	}
};

export let Mstsc = new MstscClass();