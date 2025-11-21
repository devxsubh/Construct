import { Router } from 'express';
import catchAsync from '~/utils/catchAsync';
import validate from '~/middlewares/validate';
import authenticate from '~/middlewares/authenticate';
import lexiValidation from '~/validations/lexiValidation';
import lexiController from '~/controllers/lexiAIController';

const router = Router();

// Conversation management
router.post(
	'/conversations',
	authenticate(),
	validate(lexiValidation.createConversation),
	catchAsync(lexiController.createConversation)
);

router.get(
	'/conversations',
	authenticate(),
	validate(lexiValidation.getUserConversations),
	catchAsync(lexiController.getUserConversations)
);

router.get(
	'/conversations/:conversationId',
	authenticate(),
	validate(lexiValidation.getConversation),
	catchAsync(lexiController.getConversation)
);

router.post(
	'/conversations/:conversationId/archive',
	authenticate(),
	validate(lexiValidation.getConversation),
	catchAsync(lexiController.archiveConversation)
);

router.post(
	'/conversations/:conversationId/restore',
	authenticate(),
	validate(lexiValidation.getConversation),
	catchAsync(lexiController.restoreConversation)
);

router.delete(
	'/conversations/:conversationId',
	authenticate(),
	validate(lexiValidation.getConversation),
	catchAsync(lexiController.deleteConversation)
);

// AI Assistant features
router.post('/summarize', authenticate(), validate(lexiValidation.summarizeText), catchAsync(lexiController.summarizeText));

router.post(
	'/explain',
	authenticate(),
	validate(lexiValidation.explainLegalJargon),
	catchAsync(lexiController.explainLegalJargon)
);

router.post('/analyze', authenticate(), validate(lexiValidation.analyzeRisks), catchAsync(lexiController.analyzeRisks));

router.post(
	'/suggest-clauses',
	authenticate(),
	validate(lexiValidation.suggestClauses),
	catchAsync(lexiController.suggestClauses)
);

router.post('/adjust-tone', authenticate(), validate(lexiValidation.adjustTone), catchAsync(lexiController.adjustTone));

// Unified Legal Assistant Chat endpoint
router.post('/chat', authenticate(), validate(lexiValidation.chat), catchAsync(lexiController.handleChat));

export default router;
