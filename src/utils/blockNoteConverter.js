/**
 * Convert BlockNote content to plain text
 * @param {Array|Object} blockNoteContent - BlockNote content (array of blocks or single block)
 * @returns {string} - Plain text representation
 */
export function convertBlockNoteToText(blockNoteContent) {
	if (!blockNoteContent) {
		return '';
	}

	// Handle array of blocks
	if (Array.isArray(blockNoteContent)) {
		return blockNoteContent.map((block) => convertBlockToText(block)).join('\n\n');
	}

	// Handle single block
	if (typeof blockNoteContent === 'object') {
		return convertBlockToText(blockNoteContent);
	}

	// Handle string (fallback)
	if (typeof blockNoteContent === 'string') {
		return blockNoteContent;
	}

	return '';
}

/**
 * Convert a single BlockNote block to text
 * @param {Object} block - BlockNote block object
 * @returns {string} - Plain text representation
 */
function convertBlockToText(block) {
	if (!block || typeof block !== 'object') {
		return '';
	}

	const { type, content, props } = block;

	// Handle content as string
	if (typeof content === 'string') {
		return formatBlockText(content, type, props);
	}

	// Handle content as array (inline content)
	if (Array.isArray(content)) {
		const text = content
			.map((item) => {
				if (typeof item === 'string') {
					return item;
				}
				if (item && typeof item === 'object') {
					// Handle inline content objects
					if (item.type === 'text' && item.text) {
						return item.text;
					}
					// Handle nested content
					if (item.content) {
						return convertBlockToText(item);
					}
				}
				return '';
			})
			.join('');

		return formatBlockText(text, type, props);
	}

	return '';
}

/**
 * Format block text based on type
 * @param {string} text - Text content
 * @param {string} type - Block type
 * @param {Object} props - Block properties
 * @returns {string} - Formatted text
 */
function formatBlockText(text, type, props = {}) {
	if (!text) {
		return '';
	}

	switch (type) {
		case 'heading':
			const level = props?.level || 1;
			const prefix = '#'.repeat(level) + ' ';
			return prefix + text.trim();

		case 'quote':
			return `> ${text.trim()}`;

		case 'bulletListItem':
			return `• ${text.trim()}`;

		case 'numberedListItem':
			return `1. ${text.trim()}`;

		case 'checkListItem':
			return `☐ ${text.trim()}`;

		case 'paragraph':
		default:
			return text.trim();
	}
}

/**
 * Convert BlockNote content to markdown (optional utility)
 * @param {Array|Object} blockNoteContent - BlockNote content
 * @returns {string} - Markdown representation
 */
export function convertBlockNoteToMarkdown(blockNoteContent) {
	if (!blockNoteContent) {
		return '';
	}

	if (Array.isArray(blockNoteContent)) {
		return blockNoteContent.map((block) => convertBlockToMarkdown(block)).join('\n\n');
	}

	if (typeof blockNoteContent === 'object') {
		return convertBlockToMarkdown(blockNoteContent);
	}

	return '';
}

/**
 * Convert a single block to markdown
 */
function convertBlockToMarkdown(block) {
	if (!block || typeof block !== 'object') {
		return '';
	}

	const { type, content, props } = block;
	let text = '';

	if (typeof content === 'string') {
		text = content;
	} else if (Array.isArray(content)) {
		text = content
			.map((item) => {
				if (typeof item === 'string') return item;
				if (item?.text) return item.text;
				return '';
			})
			.join('');
	}

	switch (type) {
		case 'heading':
			const level = props?.level || 1;
			return '#'.repeat(level) + ' ' + text.trim();

		case 'quote':
			return '> ' + text.trim();

		case 'bulletListItem':
			return '- ' + text.trim();

		case 'numberedListItem':
			return '1. ' + text.trim();

		case 'paragraph':
		default:
			return text.trim();
	}
}


