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
	
function gen(ast) {
	return escodegen.generate(ast);
}
	
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

function clone(nd) {
	if(nd.type === 'Identifier')
		return mkIdentifier(nd.name);
	throw new Error("cannot clone " + nd);
}

function mkObserverCall(msg, nd, args) {
	var pos = astutil.getPosition(nd);
	args = [{
		type: 'ObjectExpression',
		properties: ['url', 'start_line', 'start_offset', 'end_line', 'end_offset'].map(function(p) {
			return {
				type: 'Property',
				key: mkIdentifier(p),
				value: mkLiteral(pos[p]),
				kind: 'init'
			};
		})
	}].concat(args);
	
	return {
		type: 'ExpressionStatement',
		expression: {
			type: 'CallExpression',
			callee: {
				type: 'MemberExpression',
				object: {
					type: 'Identifier',
					name: '__observer'
				},
				property: {
					type: 'Identifier',
					name: msg
				},
				computed: false
			},
			'arguments': args
		}
	};
}

function declaresArguments(nd) {
	for(var i=0,m=nd.params.length;i<m;++i)
		if(nd.params[i].name === 'arguments')
			return true;
			
	// Note: V8, Spidermonkey and Rhino all set up an arguments array even if 'arguments' is declared as a local variable, in spite of what ECMA-262 10.6 says
	if(nd.body.body[0] && nd.body.body[0].type === 'VariableDeclaration') {
		var decls = nd.body.body[0].declarations;
		for(var j=0,n=decls.length;j<n;++j)
			if(decls[j].id.name === 'arguments')
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

function nameAsStrLit(nd) {
	return mkLiteral(String(nd.name));
}
	
function instrument_node(nd) {
	if(!nd)
		return;
		
	if(Array.isArray(nd))
		return nd.flatmap(instrument_node);

	var args;		
	if(nd.type === 'ExpressionStatement') {
		if(nd.expression.type === 'AssignmentExpression') {
			var left = nd.expression.left, right = nd.expression.right;
			
			switch(right.type) {
			case 'FunctionExpression':
				instrument_node(right);
				return [nd, mkObserverCall('afterFunctionExpression', nd, [nameAsStrLit(left), clone(left)])];
				
			case 'ObjectExpression':
				return [nd, mkObserverCall('afterObjectExpression', nd, [nameAsStrLit(left), clone(left)])];
				
			case 'ArrayExpression':
				return [nd, mkObserverCall('afterArrayExpression', nd, [nameAsStrLit(left), clone(left)])];
				
			case 'CallExpression':
				if(right.callee.type === 'Identifier') {
					args = [nameAsStrLit(left),
							nameAsStrLit(right.callee), mkArray(right['arguments'].map(nameAsStrLit)),
							clone(right.callee), mkArray(right['arguments'].map(clone))];
					return [mkObserverCall('beforeFunctionCall', nd, args), nd];
				} else {
					args = [nameAsStrLit(left),
							nameAsStrLit(right.callee.object), nameAsStrLit(right.callee.property), mkLiteral(!!astutil.getAttribute(right, 'isComputed')), mkArray(right['arguments'].map(nameAsStrLit)),
							clone(right.callee.object), clone(right.callee.property), mkArray(right['arguments'].map(clone))];
					return [mkObserverCall('beforeMethodCall', nd, args), nd];
				}
				break;
				
			case 'NewExpression':
				args = [nameAsStrLit(left),
						nameAsStrLit(right.callee), mkArray(right['arguments'].map(nameAsStrLit)),
						clone(right.callee), mkArray(right['arguments'].map(clone))];
				return [mkObserverCall('beforeNewExpression', nd, args), nd];
				
			case 'MemberExpression':
				args = [nameAsStrLit(left), nameAsStrLit(right.object), nameAsStrLit(right.property), mkLiteral(!!astutil.getAttribute(right, 'isComputed')), clone(right.object), clone(right.property)];
				return [mkObserverCall('beforeMemberRead', nd, args), nd];
				
			case 'Identifier':
				if(left.type === 'MemberExpression') {
					args = [nameAsStrLit(left.object), nameAsStrLit(left.property), mkLiteral(!!astutil.getAttribute(left, 'isComputed')), nameAsStrLit(right),
							clone(left.object), clone(left.property), clone(right)];
					return [mkObserverCall('beforeMemberWrite', nd, args), nd];
				}
				break;
				
			default:
				// do nothing
			}
		} else if(nd.expression.type === 'CallExpression') {
			instrument_node(nd.expression.callee);
		} else {
			throw new Error("unexpected expression statement of type " + nd.expression.type);
		}
	} else if(nd.type === 'FunctionExpression') {
		astutil.forEachChild(nd, instrument_node);
		if(astutil.getAttribute(nd, 'ret_var') && !declaresArguments(nd)) {
			var body = nd.body.body, n = body.length;
			body[n] = body[n-1];
			body[n-1] = mkObserverCall('atFunctionReturn', nd, [mkMemberExpr(mkIdentifier('arguments'), mkIdentifier('callee'), false),
                                                                mkIdentifier(astutil.getAttribute(nd, 'ret_var'))]);
			nd.body.body = [
				mkObserverCall('atFunctionEntry', nd, [{type: 'ThisExpression'}, mkIdentifier('arguments')]),
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
						body: [mkObserverCall('atFunctionExit', nd, [mkMemberExpr(mkIdentifier('arguments'), mkIdentifier('callee'), false)])]
					}
				}
			];
		}
	} else if(nd.type === 'BlockStatement') {
		nd.body = instrument_node(nd.body);
	} else {
		astutil.forEachChild(nd, instrument_node);
	}
	return [nd];
}

function instrument(src, file) {
	var ast = acorn.parse(src, { ranges: true, locations: true, sourceFile: file });
	var normalized = normalizer.normalize(ast, { unify_ret: true });
	return escodegen.generate(instrument_node(normalized)[0]);
}
	
if(require.main === module) {
	var file = path.basename(process.argv[2]);
	var src = fs.readFileSync(process.argv[2], 'utf-8');
	var instrumented = instrument(src, file);
	//console.log(fs.readFileSync(__dirname + "/runtime.js", 'utf-8') + "\n" + instrumented);
	fs.writeFileSync(path.dirname(process.argv[2]) + "/" + path.basename(process.argv[2], '.js') + '_inst.js', instrumented);
} else {
	exports.instrument = instrument;
}