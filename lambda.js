const axios = require('axios')
const crypto = require('crypto')
const { VM } = require('vm2')
const jsdom = require('jsdom')
const { JSDOM } = jsdom

// the `query_hash` param is hard-coded on a per-method basis. This the hash for the request we're doing.
const query_hash = 'f2405b236d85e8296cf30347c9f08c2a'

const toJSDOM = responseBody => new JSDOM(responseBody)

/**
 * Uses a small JS virtual environment to run the scripts that initialize global values for the page.
 * We get these global values so we can make authenticated requests.
 */
const getValuesOnWindow = (dom) => {
  try {
    const vm = new VM({
      sandbox: { window: {} }
      // Secure Node VM with .window pre-set as a global https://github.com/patriksimek/vm2
    })

    const bodyScripts = Array.from(dom.window.document.body.querySelectorAll('script'))
      .map(script => script.innerHTML)
      .filter(str => str.includes('_sharedData'))
    // ^ Try to filter out any other random scripts so we only evaluate the scripts we need

    codeString = [
      'function safelyExecuteSharedDataSecond(){',
      bodyScripts[0],
      'return window._sharedData',
      '} safelyExecuteSharedDataSecond()'].join(' ');

    results = vm.run(codeString)

    return [
      results.rhx_gis,
      results.entry_data.ProfilePage[0].graphql.user.id,
      results.entry_data.ProfilePage[0].graphql.user.edge_owner_to_timeline_media.page_info.end_cursor,
      results.entry_data.ProfilePage[0].graphql.user.edge_owner_to_timeline_media.page_info.has_next_page
    ]
  } catch (e) {
    return new Error('Could not execute window script to get dynamic params.')
  }
}

/**
 * Generate the x-instagram-gis header
 * @param {String} rhxGis
 * @param {String} queryVariables
 */
const generateRequestSignature = function (rhxGis, queryVariables) {
  return crypto.createHash('md5').update(`${rhxGis}:${queryVariables}`, 'utf8').digest("hex");
}

const fetchPhotos = async ({ query_hash, variables, rhx }) => {
  try {
    const vars = JSON.stringify(variables)
    const INSTAGRAM_URL = `https://www.instagram.com/graphql/query/?query_hash=${query_hash}&variables=${encodeURIComponent(vars)}`
    const GIS = generateRequestSignature(rhx, vars)
    const res = await axios.get(INSTAGRAM_URL, {
      withCredentials: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.103 Safari/537.36',
        'x-instagram-gis': GIS
      }
    })
    const { user } = res.data.data
    const nextAfter = user.edge_owner_to_timeline_media.page_info.end_cursor
    const total_images = user.edge_owner_to_timeline_media.count
    const has_next_page = user.edge_owner_to_timeline_media.page_info.has_next_page
    return {
      results: user.edge_owner_to_timeline_media.edges
        .map(edge => {
          lastImageElement = edge.node.display_resources.pop()
          return lastImageElement.src
        }),
      total_images,
      next: nextAfter,
      hasNextPage: has_next_page
    }
  } catch (e) {
    return e
  }
}

/**
 * From `url` put
 * @param {String} url
 */
async function getDynamicParams(url) {
  try {
    const { data } = await axios.get(url, {
      withCredentials: true,
      // USER AGENT MUST MATCH BETWEEN BOTH REQUESTS OR ELSE GIS WONT BE added to window correctly!
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.103 Safari/537.36',
      }
    })
    const dom = toJSDOM(data)
    const windowValues = getValuesOnWindow(dom)
    return windowValues
  } catch (e) {
    throw new Error('Could not get dynamic params for request.')
  }
}

exports.handler = async (event, done, fail) => {
  let { url, nextPage } = event.vars
  const [rhx, userId, after] = await getDynamicParams(url)
  const variables = {
    id: userId,
    first: 12, // standard amount of photos to get for Instagram's API, seems to cause weird behavior if changed
    after
  }
  try {
    const request = await fetchPhotos({ query_hash, variables, rhx })
    const pages = request.total_images / variables.first
    let photos = []
    for (let i = 0; i < pages; i++) {
      if (photos.length >= 500) break
      const result = await fetchPhotos({ query_hash, variables, rhx })
      variables.after = result.next
      photos = photos.concat(result.results)
    }
    done({
      photos: photos,
      total_images_on_acct: request.total_images,
      total_found_this_fetch: photos.length,
      lastSeenPageCursor: variables.after,
    })
  } catch (e) {
    fail(e.message)
  }
}
