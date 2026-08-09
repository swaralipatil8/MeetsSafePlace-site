/*
==================================================
 Meet's Safe Place
 Little Things Loader
==================================================
*/


document.addEventListener(
"DOMContentLoaded",
()=>{


const container =
document.getElementById(
"littleThingsContainer"
);



if(!container)
return;



fetch("data/little-things.json")

.then(response=>response.json())

.then(items=>{


items.forEach(
(item,index)=>{


const note =
document.createElement(
"article"
);



note.className =
"sticky-note fade-up";



note.style.animationDelay =
`${index * 0.1}s`;



note.innerHTML = `


<div class="sticky-icon">

${item.icon}

</div>


<h3>

${item.title}

</h3>


<p>

${item.text}

</p>


<div class="sticky-doodle">

✿

</div>


`;



container.appendChild(note);



});


})


.catch(error=>{


console.error(
"Little things loading failed:",
error
);


});


});