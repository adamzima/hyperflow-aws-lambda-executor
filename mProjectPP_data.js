module.exports = {
  body: '{"executable":"mProjectPP","args":["-X","-x","0.90598","2mass-atlas-001124n-j0850244.fits","p2mass-atlas-001124n-j0850244.fits","big_region_20161023_110659_14261.hdr"],"env":{},"inputs":[{"name":"big_region_20161023_110659_14261.hdr","_id":"4","id":"4","sigIdx":1},{"name":"2mass-atlas-001124n-j0850244.fits","_id":"29","id":"29","sigIdx":1}],"outputs":[{"name":"p2mass-atlas-001124n-j0850244.fits","status":"not_ready","uri":"/apps/37/sigs/30"},{"name":"p2mass-atlas-001124n-j0850244_area.fits","status":"not_ready","uri":"/apps/37/sigs/31"}, {"name": "test"}],"options":{"storage":"s3","bucket":"montage-lambda","prefix":"data/0.25"}}'
};