/*
 * Copyright (c) 2015 Sylvain Peyrefitte
 *
 * This file is part of mstsc.js.
 *
 * mstsc.js is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import {Mstsc} from './mstsc'
import {ws} from "../../../../../util/ws";
import {CmdType, WsData} from "../../../../../../../common/frame/WsData";
/**
 * Mouse button mapping
 * @param button {integer} client button number
 */
function mouseButtonMap(button) {
	switch(button) {
		case 0:
			return 1;
		case 2:
			return 2;
		default:
			return 0;
	}
};
export class Client {

	constructor(canvas) {
		this.canvas = canvas;
		// // create renderer
		this.render = new Mstsc.Canvas.create(this.canvas);
		// this.socket = null;
		this.activeSession = false;
		this.install();
	}

	install () {
		var self = this;
		// bind mouse move event
		this.canvas.addEventListener('mousemove', function (e) {

			var offset = Mstsc.elementOffset(self.canvas);
			ws.sendData(CmdType.mouse,{
				x:e.clientX - offset.left,
				y:e.clientY - offset.top,
				button:0,
				isPressed:false
			})
			e.preventDefault || !self.activeSession();
			return false;
		});
		this.canvas.addEventListener('mousedown', function (e) {

			var offset = Mstsc.elementOffset(self.canvas);
			ws.sendData(CmdType.mouse,{
				x:e.clientX - offset.left,
				y:e.clientY - offset.top,
				button:mouseButtonMap(e.button),
				isPressed:true
			})
			e.preventDefault();
			return false;
		});
		this.canvas.addEventListener('mouseup', function (e) {
			if ( !self.activeSession) return;
			var offset = Mstsc.elementOffset(self.canvas);
			ws.sendData(CmdType.mouse,{
				x:e.clientX - offset.left,
				y:e.clientY - offset.top,
				button:mouseButtonMap(e.button),
				isPressed:false
			})
			e.preventDefault();
			return false;
		});
		this.canvas.addEventListener('contextmenu', function (e) {
			if (  !self.activeSession) return;

			var offset = Mstsc.elementOffset(self.canvas);
			ws.sendData(CmdType.mouse,{
				x:e.clientX - offset.left,
				y:e.clientY - offset.top,
				button:mouseButtonMap(e.button),
				isPressed:false
			})
			e.preventDefault();
			return false;
		});
		this.canvas.addEventListener('DOMMouseScroll', function (e) {
			if (!self.activeSession) return;

			var isHorizontal = false;
			var delta = e.detail;
			var step = Math.round(Math.abs(delta) * 15 / 8);

			var offset = Mstsc.elementOffset(self.canvas);
			ws.sendData(CmdType.wheel,{
				x:e.clientX - offset.left,
				y:e.clientY - offset.top,
				step,
				isNegative:delta > 0,
				isHorizontal
			})
			e.preventDefault();
			return false;
		});
		this.canvas.addEventListener('mousewheel', function (e) {
			if (!self.activeSession) return;

			var isHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
			var delta = isHorizontal?e.deltaX:e.deltaY;
			var step = Math.round(Math.abs(delta) * 15 / 8);

			var offset = Mstsc.elementOffset(self.canvas);
			ws.sendData(CmdType.wheel,{
				x:e.clientX - offset.left,
				y:e.clientY - offset.top,
				step,
				isNegative:delta > 0,
				isHorizontal
			})
			e.preventDefault();
			return false;
		});

		// bind keyboard event
		window.addEventListener('keydown', function (e) {
			if (!self.activeSession) return;
			ws.sendData(CmdType.scancode,{
				code:Mstsc.scancode(e),
				isPressed:true
			})

			e.preventDefault();
			return false;
		});
		window.addEventListener('keyup', function (e) {
			if ( !self.activeSession) return;
			ws.sendData(CmdType.scancode,{
				code:Mstsc.scancode(e),
				isPressed:false
			})
			e.preventDefault();
			return false;
		});

		return this;
	}
	/**
	 * connect
	 * @param ip {string} ip target for rdp
	 * @param domain {string} microsoft domain
	 * @param username {string} session username
	 * @param password {string} session password
	 * @param next {function} asynchrone end callback
	 */
	connect  (ip, domain, username, password, next) {

		// start connection
		var self = this;
		ws.addMsg(CmdType.rdp_connect,(wsData)=>{
			console.log('[mstsc.js] connected');
			self.activeSession = true;
		});
		ws.addMsg(CmdType.rdp_bitmap,(wsData)=>{
			const context = wsData.context;
			// 数组类型转换
			context.data = context.data.data;
			self.render.update(context);
		});
		ws.addMsg(CmdType.rdp_close,(wsData)=>{
			next(null);
			console.log('[mstsc.js] close');
			self.activeSession = false;
		});
		ws.addMsg(CmdType.rdp_error,(wsData)=>{
			// next(err);
			// console.log('[mstsc.js] error : ' + err.code + '(' + err.message + ')');
			self.activeSession = false;
		});
		const wsData = new WsData();
		wsData.cmdType = CmdType.infos;
		wsData.context = {
			ip : ip.indexOf(":")>-1 ? ip.split(":")[0] : ip,
			port : ip.indexOf(":")>-1 ? parseInt(ip.split(":")[1]) : 3389,
			screen : {
				width : this.canvas.width,
				height : this.canvas.height
			},
			domain : domain,
			username : username,
			password : password,
			locale : Mstsc.locale()
		}
		ws.send(wsData)


	}
}