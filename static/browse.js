// Observe when thumbnails enter the viewport so they can be lazy loaded
const logoObserver = new IntersectionObserver(entries => {
	for (const entry of entries) {
		if (entry.isIntersecting) {
			const thumbnail = entry.target;
			logoObserver.unobserve(thumbnail);

			const result = thumbnail.parentNode;
			const logo = `url("${result.dataset.logo}")`;
			const screenshot = `url("${result.dataset.screenshot}")`;

			// Show screenshot when hovering over logo
			thumbnail.addEventListener('mouseover', () => { thumbnail.style.backgroundImage = screenshot; });
			thumbnail.addEventListener('mouseout', () => { thumbnail.style.backgroundImage = logo; });
			thumbnail.style.backgroundImage = logo;
		}
	}
});

document.addEventListener('DOMContentLoaded', () => {
	for (const thumbnail of document.querySelectorAll('.thumbnail'))
		logoObserver.observe(thumbnail);
});