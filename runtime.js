/*******************************************************************************
 * Copyright (c) 2013 Max Schaefer.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *     Max Schaefer - initial API and implementation
 *******************************************************************************/

/*global console*/

var __observer;

if(!__observer) {
	__observer = (function(global) {
		var messages = [];
		
		function setHiddenProp(obj, prop, val) {
			try {
				Object.defineProperty(obj, prop, { enumerable: false, writable: true, value: val });
			} catch(e) {}
			return val;
		}
		
		// do a depth-first traversal of the object graph rooted at 'obj' and tag functions with their path names inside this graph
		function tag_native_functions(obj, path) {
			if(typeof obj === 'function' || obj && typeof obj === 'object') {
				// avoid infinite recursion
				if(obj.hasOwnProperty('__visited'))
					return;
				setHiddenProp(obj, '__visited', true);

				// tag if it's a function
				if(typeof obj === 'function')
					setHiddenProp(obj, '__path', path.join('.'));
				
				Object.getOwnPropertyNames(obj).forEach(function(p) {
					// skip numeric indices
					if(!isNaN(Number(p)))
						return;
						
					path.push(p);
					try { tag_native_functions(obj[p], path); } catch(e) {}
					path.pop();
				});
			}
		}
		tag_native_functions(global, []);
		
		function Observer() {
			this.messages = [];
		}
		
		Observer.prototype.log = function(pos, msg) {
			var log_msg = pos.url + "@" + pos.start_line + ":" + pos.start_offset + ": " + msg;
			if(this.messages.indexOf(log_msg) === -1)
				this.messages.push(log_msg);
		};
		
		Observer.prototype.getLog = function() {
			return this.messages.join('\n');
		};
		
		Observer.prototype.atFunctionEntry = function(pos, recv, args) {
			setHiddenProp(args, '__is_arguments_array', true);
		};
		
		Observer.prototype.atFunctionReturn = function(pos, fn, ret) {};
		
		Observer.prototype.atFunctionExit = function(pos, fn) {};
		
		Observer.prototype.beforeMemberAccess = function(pos, obj_val, prop_val, isDynamic, mode) {
			if(isDynamic && typeof prop_val !== 'number')
				this.log(pos, "dynamic " + mode + " of property " + prop_val);
			if(obj_val.__is_arguments_array)
				this.log(pos, "access to arguments['" + prop_val + "']");
			if(String(prop_val) === 'constructor')
				this.log(pos, "access to constructor property");
		};
		
		Observer.prototype.beforeMemberRead = function(pos, lhs, obj, prop, isDynamic, obj_val, prop_val) {
			this.beforeMemberAccess(pos, obj_val, prop_val, isDynamic, 'read');
		};
		
		Observer.prototype.beforeMemberWrite = function(pos, obj, prop, isDynamic, rhs, obj_val, prop_val, rhs_val) {
			this.beforeMemberAccess(pos, obj_val, prop_val, isDynamic, 'write');
		};
		
		function describe(fn) {
			if(fn) {
				if(fn.hasOwnProperty('__sourcepos')) {
					var pos = fn.__sourcepos;
					return pos.url + "@" + pos.start_line + ":" + pos.start_offset;
				} else if(fn.hasOwnProperty('__path')) {
					return fn.__path;
				}
			}
		}
		
		Observer.prototype.beforeCall = function(pos, callee_val, mode) {
			var descr = describe(callee_val);
			if(descr)
				this.log(pos, mode + " call to " + descr);
		};
		
		Observer.prototype.beforeFunctionCall = function(pos, lhs, callee, args, callee_val, args_val) {
			this.beforeCall(pos, callee_val, 'function');
		};
		
		Observer.prototype.beforeMethodCall = function(pos, lhs, obj, prop, isDynamic, args, obj_val, prop_val, args_val) {
			this.beforeMemberAccess(pos, obj_val, prop_val, isDynamic, 'read');
			this.beforeCall(pos, obj_val[prop_val], 'method');
		};
		
		Observer.prototype.beforeNewExpression = function(pos, lhs, callee, args, callee_val, args_val) {
			this.beforeCall(pos, callee_val, 'new');
		};
		
		Observer.prototype.afterFunctionExpression = function(pos, lhs, fn) {
			setHiddenProp(fn, '__sourcepos', pos);
		};
		
		Observer.prototype.afterObjectExpression = function(pos, lhs, obj) {};
		Observer.prototype.afterArrayExpression = function(pos, lhs, ary)  {};
		
		return new Observer();
	})(this);
}