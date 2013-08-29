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

/*global require process console __dirname module exports*/

var fs = require("fs"),
	path = require("path"),
	acorn = require("acorn"),
	escodegen = require("escodegen"),
	normalizer = require("JS_WALA/normalizer/lib/normalizer.js"),
	astutil = require("JS_WALA/common/lib/ast.js");
	
function parseStmt(src) {
	return acorn.parse(src).body[0];
}

function mkIdentifier(x) {
	return { type: 'Identifier', name: x };
}

function mkMemberExpr(obj, prop, comp) {
	return { type: 'MemberExpression', object: obj, property: prop, computed: comp };
}

function mkArray(elts) {
	return { type: 'ArrayExpression', elements: elts };
}

function mkOr(x, y) {
	return { type: 'LogicalExpression',
			 operator: '||',
			 left: x,
			 right: y };
}

function mkAssignStmt(lhs, rhs) {
	return {
		type: 'ExpressionStatement',
		expression: {
			type: 'AssignmentExpression',
			operator: '=',
			left: lhs,
			right: rhs
		}
	};
}

function mkPosRecord(pos, props) {
	return {
		type: 'ObjectExpression',
		properties: props.map(function(p) {
			return {
				type: 'Property',
				key: mkIdentifier(p),
				value: mkLiteral(pos[p]),
				kind: 'init'
			};
		})
	};
}

function mkRuntimeCall(m, nd, props, args) {
	args = args || [];
	if (nd && props) {
		var pos = astutil.getPosition(nd);
		args = [mkPosRecord(pos, props)].concat(args);
	}
	
	return {
		type: 'CallExpression',
		callee: {
			type: 'MemberExpression',
			object: {
				type: 'Identifier',
				name: '__runtime'
			},
			property: {
				type: 'Identifier',
				name: m
			},
			computed: false
		},
		'arguments': args
	};
}

function mkRuntimeCallStmt(m, nd, props, args) {
	return {
		type: 'ExpressionStatement',
		expression: mkRuntimeCall(m, nd, props, args)
	};
}

function mkThis() {
	return { type: 'ThisExpression' };
}

function declares(nd, x) {
	for(var i=0,m=nd.params.length;i<m;++i)
		if(nd.params[i].name === x)
			return true;
			
	// Note: V8, Spidermonkey and Rhino all set up an arguments array even if 'arguments' is declared as a local variable, in spite of what ECMA-262 10.6 says
	if(nd.body.body[0] && nd.body.body[0].type === 'VariableDeclaration') {
		var decls = nd.body.body[0].declarations;
		for(var j=0,n=decls.length;j<n;++j)
			if(decls[j].id.name === x)
				return true;
	}
			
	return false;
}

function mkLiteral(v) {
	if (typeof v === 'number' && v < 0) {
		return {
			type: 'UnaryExpression',
			operator: '-',
			argument: {
				type: 'Literal',
				value: -v
			},
			prefix: true
		};
	} else {
		return {
			type: 'Literal',
			value: v
		};
	}
}

// keep track of which enclosing function expression names are currently visible
var visible_fn_exprs = [];

// update the list of visible function expression names upon entering a new function
// TODO: should also update when entering 'catch' clause
function update_visible_fn_exprs(vfe, nd) {
	var res = [];
	vfe.forEach(function(id) {
		if (!declares(nd, id)) {
			res.push(id);
		}
	});
	if (nd.id && !declares(nd, nd.id.name)) {
		res.push(nd.id.name);
	}
	return res;
}

function instrument_node(nd) {
	if(!nd)
		return;
		
	if(Array.isArray(nd))
		return nd.forEach(instrument_node);

	switch(nd.type) {
	case 'Program':
		var global_closure_call = nd.body[0].expression;
		global_closure_call['arguments'][0] = mkRuntimeCall('wrapGlobal', nd, [], [global_closure_call['arguments'][0]]);
		instrument_node(global_closure_call.callee.body);
		global_closure_call.callee.body.body = [
			mkRuntimeCallStmt("enterScript", nd, ['url']),
			{
				type: 'TryStatement',
				block: {
					type: 'BlockStatement',
					body: global_closure_call.callee.body.body
				},
				guardedHandlers: [],
				handlers: [],
				finalizer: {
					type: 'BlockStatement',
					body: [mkRuntimeCallStmt("leaveScript")]
				}
			}];
		break;
		
	case 'VariableDeclaration':
		nd.declarations.forEach(function(decl) {
			decl.init = mkRuntimeCall("wrapLiteral", decl, ['start_offset']);
		});
		break;
		
	case 'ExpressionStatement':
		if(nd.expression.type === 'AssignmentExpression') {
			var left = nd.expression.left, right = nd.expression.right;
			
			switch(right.type) {
			case 'FunctionExpression':
			case 'ArrayExpression':
			case 'Literal':
				instrument_node(right);
				nd.expression.right = mkRuntimeCall('wrapLiteral', nd, ['start_offset'], [right]);
				break;

			// almost the same as the previous case, but we pass position information for getters and setters to wrapLiteral				
			case 'ObjectExpression':
				var getter_pos = { type: 'ObjectExpression', properties: [] };
				var setter_pos = { type: 'ObjectExpression', properties: [] };
				for(var i=0,n=right.properties.length;i<n;++i) {
					var property = right.properties[i];
					if(property.kind === 'get') {
						getter_pos.properties.push({ type: 'Property', key: mkIdentifier(property.key.name), value: mkPosRecord(astutil.getPosition(property.value), ['start_offset']) });
					} else if(property.kind === 'set') {
						setter_pos.properties.push({ type: 'Property', key: mkIdentifier(property.key.name), value: mkPosRecord(astutil.getPosition(property.value), ['start_offset']) });
					}
				}
				
				instrument_node(right);
				nd.expression.right = mkRuntimeCall('wrapLiteral', nd, ['start_offset'], [right, getter_pos, setter_pos]);
				break;
				
			case 'CallExpression':
				if(right.callee.type === 'Identifier') {
					// HACK: need to properly treat direct eval calls
					if(right.callee.name === 'eval') {
						nd.expression.right = mkRuntimeCall('wrapNativeException', nd, ['start_offset'], [right]);
					} else {
						nd.expression.right = mkRuntimeCall('funcall', nd, ['start_offset'], [right.callee, mkIdentifier('__global'), mkArray(right['arguments'])]);
					}
				} else {
					nd.expression.right = mkRuntimeCall('methodcall', nd, ['start_offset'], [right.callee.object, right.callee.property, mkArray(right['arguments'])]);
				}
				break;
				
			case 'NewExpression':
				nd.expression.right = mkRuntimeCall('newexpr', nd, ['start_offset'], [right.callee, mkArray(right['arguments'])]);
				break;
				
			case 'MemberExpression':
				nd.expression.right = mkRuntimeCall('propread', nd, ['start_offset'], [right.object, right.property, mkLiteral(!!astutil.getAttribute(right, 'isComputed'))]);
				break;
				
			case 'Identifier':
				// if this identifier refers to an enclosing function expression, we need to treat it as a literal
				if(visible_fn_exprs.indexOf(right.name) !== -1) {
					nd.expression.right = mkRuntimeCall('wrapLiteral', nd, ['start_offset'], [right]);
				}
				
				if(left.type === 'MemberExpression') {
					nd.expression = mkRuntimeCall('propwrite', nd, ['start_offset'], [left.object, left.property, mkLiteral(!!astutil.getAttribute(left, 'isComputed')), right]);
				}
				break;
				
			case 'LogicalExpression':
			case 'BinaryExpression':
				nd.expression.right = mkRuntimeCall('binop', nd, ['start_offset'], [right.left, mkLiteral(right.operator), right.right]);
				break;
				
			case 'UnaryExpression':
				if(right.operator === 'delete') {
					if(right.argument.type === 'MemberExpression') {
						nd.expression.right = mkRuntimeCall('propdel', nd, ['start_offset'], [right.argument.object, right.argument.property, mkLiteral(!!astutil.getAttribute(right.argument, 'isComputed'))]);
					}
				} else {
					nd.expression.right = mkRuntimeCall('unop', nd, ['start_offset'], [mkLiteral(right.operator), right.argument]);
				}
				break;
				
			case 'ThisExpression':
				break;
				
			default:
				throw new Error("unexpected RHS type " + right.type);
			}
		} else {
			throw new Error("unexpected expression type " + nd.expression.type);
		}
		break;
		
	case 'IfStatement':
		nd.test = mkRuntimeCall('unwrap', null, null, [nd.test]);
		instrument_node(nd.consequent);
		instrument_node(nd.alternate);
		break;
		
	case 'ObjectExpression':
		nd.properties.forEach(instrument_node);
		break;
		
	case 'ArrayExpression':
		nd.elements.forEach(instrument_node);
		break;
		
	case 'Property':
		// TODO: handle getters and setters
		instrument_node(nd.value);
		break;
		
	case 'WhileStatement':
		nd.test = mkRuntimeCall('unwrap', null, null, [nd.test]);
	case 'LabeledStatement':
		instrument_node(nd.body);
		break;
		
	case 'BlockStatement':
		nd.body.forEach(instrument_node);
		break;
		
	case 'ForInStatement':
		var loopvar = nd.left.name;
		nd.right = mkRuntimeCall('unwrap', null, null, [nd.right]);
		instrument_node(nd.body);
		nd.body.body.unshift(mkAssignStmt(mkIdentifier(loopvar), mkRuntimeCall('wrapForInVar', nd, ['start_offset'], [mkIdentifier(loopvar)])));
		break;
		
	case 'TryStatement':
		instrument_node(nd.block);
		if(nd.handlers.length > 0) {
			var exnvar = nd.handlers[0].param.name;
			instrument_node(nd.handlers[0].body);
			nd.handlers[0].body.body.unshift(mkAssignStmt(mkIdentifier(exnvar), mkRuntimeCall('wrapNativeException', nd, ['start_offset'], [mkIdentifier(exnvar)])));
		}
		instrument_node(nd.finalizer);
		break;
		
	case 'ReturnStatement':
	case 'Literal':
	case 'Identifier':
	case 'DebuggerStatement':
	case 'ThrowStatement':
	case 'EmptyStatement':
	case 'BreakStatement':
	case 'ContinueStatement':
		break;
		
	case 'FunctionExpression':
		// adjust list of visible function expression names inside the body
		var old_visible_fn_exprs = visible_fn_exprs;
		visible_fn_exprs = update_visible_fn_exprs(visible_fn_exprs, nd);
		
		// instrument body
		instrument_node(nd.body);
		
		// restore previous list
		visible_fn_exprs = old_visible_fn_exprs;
		
		if (declares(nd, 'arguments')) {
			// TODO: wrap all arguments (if caller is native), undefined arguments (if not)
			throw new Error("cannot handle this yet");
		} else {
			nd.body.body.unshift(mkAssignStmt(mkIdentifier('arguments'), mkRuntimeCall('prepareArguments', nd, null, [mkIdentifier('arguments')])));
		}
		
		// insert code to wrap any arguments that are falsy---this can only be the case if they weren't explicitly passed
		for(var i=nd.params.length-1;i>=0;--i) {
			nd.body.body.unshift(mkAssignStmt(mkIdentifier(nd.params[i].name), mkOr(mkIdentifier(nd.params[i].name), mkRuntimeCall('wrapLiteral', nd.params[i], ['start_offset']))));
		}

		var body = nd.body.body,
		    n = body.length,
		    retvar = astutil.getAttribute(nd, 'ret_var');
		body[n] = body[n-1];
		body[n-1] = mkRuntimeCallStmt('returnFromFunction', nd, null, [mkIdentifier(retvar)]);
		nd.body.body = [
			{
				type: 'IfStatement',
				test: {
					type: 'UnaryExpression',
					operator: '!',
					argument: mkRuntimeCall('isWrapped', nd, null, [mkThis()])
				},
				consequent: {
					type: 'ReturnStatement',
					argument: mkRuntimeCall('callWrapped', nd, null, [mkThis(), mkIdentifier('arguments')])
				},
				alternate: null
			},
			mkRuntimeCallStmt('enterFunction', nd, ['url', 'start_offset'], [mkMemberExpr(mkIdentifier('arguments'), mkIdentifier('callee'), false)]),
			{
				type: 'TryStatement',
				block: {
					type: 'BlockStatement',
					body: body
				},
				guardedHandlers: [],
				handlers: [],
				finalizer: {
					type: 'BlockStatement',
					body: [
					mkRuntimeCallStmt('leaveFunction')]
				}
			}
		];
		break;
	
	default:
		throw new Error("unexpected node type: " + nd.type);
	}
}

function instrument(src, file) {
	var ast = acorn.parse(src, { ranges: true, locations: true, sourceFile: file });
	var normalized = normalizer.normalize(ast, { unify_ret: true });
	instrument_node(normalized);
	return escodegen.generate(normalized);
}
	
if(require.main === module) {
	var file = path.basename(process.argv[2]);
	var src = fs.readFileSync(process.argv[2], 'utf-8');
	var instrumented = instrument(src, file);
	console.log(instrumented);
	//fs.writeFileSync(path.dirname(process.argv[2]) + "/" + path.basename(process.argv[2], '.js') + '_inst.js', instrumented);
} else {
	exports.instrument = instrument;
}