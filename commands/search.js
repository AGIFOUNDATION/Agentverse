const { URL } = require('url');
const Google = require('google');
const config = require('../config.json');

Google.requestOptions = {
	timeout: 30000,
	headers: {
		'Accept': 'text/html,application/xhtml+xml,application/xml',
		'Accept-Language': 'en',
		'Cache-Control': 'max-age=0',
		'Connection': 'keep-alive',
		'DNT': 1
	}
};
if (!!config.extensions?.google_search?.proxy) {
	Google.requestOptions.proxy = config.extensions.google_search.proxy;
}

const command = {
	"name": "Search",
	"cmd": "google_search",
	"alias": ['google', 'search', 'google search'],
	"args": {
		"query": "query"
	}
};

const parseParams = param => {
	var json = {};
	param = (param || '').split('?');
	param.shift();
	param = (param || '').join('?').split('&');
	param.forEach(item => {
		item = item.split('=');
		var key = item.shift();
		item = item.join('=');
		json[key] = item;
	});
	return json;
};

const scrabGoogle = (query) => new Promise((res, rej) => {
	Google(query, async (err, data) => {
		if (!!err) {
			rej(err.message || err.msg || err);
			return;
		}

		var items = [];
		var content = data.body;
		content = content
			.replace(/<![^>]*?>/gi, '')
			.replace(/<(noscript|script|title|style|header|footer|head|ul|ol)[\w\W]*?>[\w\W]*?<\/\1>/gi, '')
			.replace(/<(meta|input|img)[\w\W]*?>/gi, '')
			.replace(/<[^\/\\]*?[\/\\]>/gi, '')
			.replace(/<\/?(html|body)[^>]*?>/gi, '')
			.replace(/<\/?span[^>]*?>/gi, '')
			.replace(/<\/?(div|br|hr)[^>]*?>/gi, '\n')
		;
		content = content.replace(/<a[^>]*href=('|")([^'"]*)\1[^>]*>([\w\W]*?)<\/a>/gi, (match, quote, url, inner) => {
			if (url.match(/^https?:\/\/.*?\.google/)) return '';
			if (url.match(/^\s*\//) && !url.match(/^\s*\/url\?/)) return '';
			return match;
		});
		while (true) {
			let temp = content.replace(/<([\w\-_]+)[^>]*?>[\s\r\t\n]*<\/\1>/gi, '');
			if (content === temp) break;
			content = temp;
		}
		content = content
			.replace(/^[\w\W]*?<a/i, '<a')
			.replace(/Related searches[\w\W]*?$/i, '')
			.replace(/[\s\r\t]*\n+[\s\r\t]*/g, '\n')
			.replace(/\n+/g, '\n')
		;
		content.replace(/<a[^>]*?>[\s\r\n]*<h3/gi, (match, pos) => {
			items.push(pos)
		});
		items.push(content.length);

		for (let i = 0; i < items.length - 1; i ++) {
			let a = items[i], b = items[i + 1];
			let sub = content.substring(a, b);
			let url = sub.match(/^[\s\r\n]*<a[^>]*?href=('|")?([^'"]*?)\1[^>]*?>/i);
			if (!url || !url[2]) continue;
			url = parseParams(url[2]);
			for (let key in url) {
				let value = url[key];
				if (value.match(/^https?/i)) {
					url = decodeURI(value);
					break;
				}
			}
			sub = sub
				.replace(/<\/?\w+[^>]*?>/gi, '')
				.replace(/[\s\r\t]*\n+[\s\r\t]*/g, '\n')
				.replace(/\n+/g, '\n')
				.replace(/^\n+|\n+$/g, '');
			;
			items[i] = [url, sub];
		}
		items.pop();

		if (!items.length) {
			return res('nothing found.');
		}
		else {
			let limit = config.extensions?.google_search?.count;
			if (!(limit > 0)) limit = Infinity;
			if (items.length > limit) {
				items.splice(limit);
			}
		}

		var result = [];
		items.forEach(item => {
			var ctx = item[1];
			ctx = ctx.split('\n');
			ctx = ctx.map(line => line.replace(/^\-\s*/, '')).join('\n  ');
			result.push('- ' + ctx + '\n  link: ' + item[0]);
		});
		res(result.join('\n'));
	});
});

command.execute = async (type, caller, target) => {
	var result = {};
	var queries = [];
	for (let key in target) {
		if (!!key.match(/\b(args?|name|q|query|s|search|f|find)\b/i)) {
			queries.push(target[key]);
		}
	}

	try {
		await Promise.all(queries.map(async query => {
			result[query] = await scrabGoogle(query);
		}));
		var reply = [];
		for (let target in result) {
			reply.push('Search Google for "' + target + '" got:\n' + result[target]);
		}
		reply = reply.join('\n\n');
		return {
			speak: reply,
			reply: reply,
		};
	}
	catch (err) {
		return {
			speak: "Search Google for \"" + queries.join(', ') + "\" failed.",
			reply: "failed",
		};
	}
};

module.exports = command;