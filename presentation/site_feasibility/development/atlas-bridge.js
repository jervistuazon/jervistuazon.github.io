(() => {
let viewer,home,originals=new Map();
const post=(type,data={})=>parent.postMessage({type,...data},location.origin);
const timer=setInterval(()=>{
 const v=window.__VIEWER__;if(!v)return;
 // Towers are represented by many named parts, not one R_W01 group.
 let hasTower=false;v.scene.traverse(o=>{if(o.name.startsWith('R_W01_'))hasTower=true});if(!hasTower)return;
 viewer=v;home={position:v.camera.position.clone(),target:v.controls.target.clone(),up:v.camera.up.clone(),near:v.camera.near};clearInterval(timer);softenGrass(v);post('atlas-ready');
},300);

function softenGrass(v){
 const materials=new Map();
 function finish(material){
  if(!/^M_Grass(?:_Light)?$/.test(material.name))return material;
  if(materials.has(material))return materials.get(material);
  const next=material.clone();next.map=null;next.normalMap=null;next.bumpMap=null;next.roughnessMap=null;next.aoMap=null;
  next.color.set(material.name==='M_Grass_Light'?'#829465':'#71835b');next.roughness=1;next.metalness=0;
  // Broad, low-contrast procedural variation replaces the repeated grass bitmap.
  // Local coordinates keep it attached to the actual terrain geometry.
  next.onBeforeCompile=shader=>{
   shader.vertexShader='varying vec2 vGrassXZ;\n'+shader.vertexShader;
   shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvGrassXZ = position.xz * 0.018;');
   shader.fragmentShader='varying vec2 vGrassXZ;\nfloat grassHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\nfloat grassNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(grassHash(i),grassHash(i+vec2(1,0)),f.x),mix(grassHash(i+vec2(0,1)),grassHash(i+vec2(1,1)),f.x),f.y);}\n'+shader.fragmentShader;
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb *= 0.965 + 0.07 * (0.65 * grassNoise(vGrassXZ) + 0.35 * grassNoise(vGrassXZ * 2.31 + vec2(4.1,8.7)));');
  };
  next.customProgramCacheKey=()=> 'atlas-soft-grass-v1';next.needsUpdate=true;materials.set(material,next);return next;
 }
 v.scene.traverse(o=>{if(o.isMesh)o.material=Array.isArray(o.material)?o.material.map(finish):finish(o.material)});
}

function restore(){for(const [mesh,material] of originals){mesh.material.dispose();mesh.material=material}originals.clear()}
function choose(name){if(!viewer)return;restore();const objects=[];viewer.scene.traverse(o=>{if(o.name.startsWith(name+'_'))objects.push(o)});if(!objects.length)return;
 const b=new viewer.THREE.Box3();
 for(const object of objects){b.expandByObject(object);object.traverse(m=>{if(!m.isMesh||Array.isArray(m.material)||originals.has(m))return;originals.set(m,m.material);m.material=m.material.clone();if(m.material.emissive){m.material.emissive.set('#429784');m.material.emissiveIntensity=.3;}})}
 const center=b.getCenter(new viewer.THREE.Vector3()),size=b.getSize(new viewer.THREE.Vector3()).length();const direction=viewer.camera.position.clone().sub(viewer.controls.target).normalize();viewer.camera.up.set(0,1,0);viewer.controls.target.copy(center);viewer.camera.position.copy(center).addScaledVector(direction,Math.max(size*2,.2));viewer.camera.near=.005;viewer.camera.updateProjectionMatrix();viewer.controls.update();viewer.smoothZoom?.sync();post('atlas-selected',{name});
}
window.addEventListener('message',event=>{
 if(event.source!==parent||event.origin!==location.origin||!viewer)return;const {command,value}=event.data||{};const v=viewer;
 if(command==='tower')choose(value);
 if(command==='home'){restore();v.camera.position.copy(home.position);v.camera.up.copy(home.up);v.camera.near=home.near;v.camera.updateProjectionMatrix();v.controls.target.copy(home.target);v.controls.autoRotate=false;v.controls.update();v.smoothZoom?.sync();}
 if(command==='top'){v.camera.position.copy(home.target).add(new v.THREE.Vector3(0,1.7,.001));v.camera.up.set(0,0,-1);v.controls.target.copy(home.target);v.controls.update();v.smoothZoom?.sync();}
 if(command==='orbit'){v.controls.autoRotate=Boolean(value);v.controls.autoRotateSpeed=.5;}
 if(command==='zoom'){const offset=v.camera.position.clone().sub(v.controls.target);v.camera.position.copy(v.controls.target).add(offset.multiplyScalar(value));v.controls.update();v.smoothZoom?.sync();}
 if(command==='layer'){const patterns={roads:/Campus_Roads|Outer_Road/,landscape:/Tree|Grass|Plant|Shrub/i};v.scene.traverse(o=>{if(value.name==='hotspots'&&o.isSprite)o.visible=value.visible;else if(patterns[value.name]?.test(o.name))o.visible=value.visible;});}
});
window.addEventListener('error',event=>post('atlas-error',{message:event.message}));
})();
