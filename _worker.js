export default {
  async fetch(request, env) {
    const uptimerobot_id = env.UPTIME_ROBOT_ID || '';

    const upstream = 'stats.uptimerobot.com';
    const upstream_path = '/' + uptimerobot_id;

    const replace_dict = {
      '$upstream': '$custom_domain',
      'counter.innerText = "59";': 'counter.innerText = "10";',
      [uptimerobot_id]: '-h-',
    };

    return await fetchAndApply(request, uptimerobot_id, upstream, upstream_path, replace_dict);
  }
};

async function fetchAndApply(request, uptimerobot_id, upstream, upstream_path, replace_dict) {
  const region = request.headers.get('cf-ipcountry').toUpperCase();
  const ip_address = request.headers.get('cf-connecting-ip');

  let url = new URL(request.url);
  let url_hostname = url.hostname;
  url.protocol = 'https:';
  let upstream_domain = upstream;
  url.host = upstream_domain;

  if (url.pathname == '/') {
    url.pathname = upstream_path;
  } else if (!isNaN(parseInt(url.pathname.split('/')[1]))) {
    url.pathname = upstream_path + url.pathname;
  }

  url.pathname = url.pathname.replace('-h-', uptimerobot_id);

  let new_request_headers = new Headers(request.headers);
  new_request_headers.set('Host', upstream_domain);
  new_request_headers.set('Referer', url.protocol + '//' + url_hostname);

  let original_response = await fetch(url.href, {
    method: request.method,
    headers: new_request_headers,
  });

  let original_response_clone = original_response.clone();
  let original_text = null;
  let new_response_headers = new Headers(original_response.headers);
  let status = original_response.status;

  // 删除不需要的响应头
  new_response_headers.delete('content-security-policy');
  new_response_headers.delete('content-security-policy-report-only');
  new_response_headers.delete('clear-site-data');

  const content_type = new_response_headers.get('content-type');
  if (content_type != null && content_type.includes('text/html') && content_type.includes('UTF-8')) {
    original_text = await replace_response_text(original_response_clone, upstream_domain, url_hostname, replace_dict);
  } else {
    original_text = original_response_clone.body;
  }

  return new Response(original_text, {
    status,
    headers: new_response_headers
  });
}

async function replace_response_text(response, upstream_domain, host_name, replace_dict) {
  let text = await response.text();
  for (let i in replace_dict) {
    let j = replace_dict[i];
    if (i == '$upstream') {
      i = upstream_domain;
    } else if (i == '$custom_domain') {
      i = host_name;
    }

    if (j == '$upstream') {
      j = upstream_domain;
    } else if (j == '$custom_domain') {
      j = host_name;
    }

    let re = new RegExp(i, 'g');
    text = text.replace(re, j);
  }
  // 移除 tracker
  return text.replace(text.substr(text.indexOf('var _rollbarConfig')).split('</head>')[0], '</script>').replaceAll('/-h-"', '"');
}
