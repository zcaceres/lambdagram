const axios = require('axios')
const crypto = require('crypto')

const generateRequestSignature = function(rhxGis, queryVariables) {
    return crypto.createHash('md5').update(`${rhxGis}:${queryVariables}`, 'utf8').digest("hex");
};

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
    } catch(e) {
        return e
    }
}

exports.handler = async (event, done, fail) => {
    let { query_hash, variables, rhx, initialRequest } = event.vars
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
            lastSeen: variables.after,
            photos: photos.join('\n'),
            total_found: photos.length
        })
    } catch (e) {
        fail(e.message)
    }
}
