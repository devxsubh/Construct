import { Router } from 'express';
import catchAsync from '~/utils/catchAsync';
import authenticate from '~/middlewares/authenticate';
import contractController from '~/controllers/contractController';
import validate from '~/middlewares/validate';
import contractValidation from '~/validations/contractValidation';
import checkSubscription from '~/middlewares/checkSubscription';

const router = Router();

// Contract CRUD operations
router.post(
	'/',
	authenticate(),
	checkSubscription,
	validate(contractValidation.createContract),
	catchAsync(contractController.createContract)
);
router.post(
	'/generate',
	authenticate(),
	checkSubscription,
	validate(contractValidation.generateAIContract),
	catchAsync(contractController.generateAIContract)
);

// Iterative contract modification endpoint (conversation history-based, like ChatGPT Canvas)
router.post(
	'/:contractId/modify',
	authenticate(),
	validate(contractValidation.modifyContractWithPrompt),
	catchAsync(contractController.modifyContractWithPrompt)
);

router.put(
	'/:contractId',
	authenticate(),
	validate(contractValidation.updateContract),
	catchAsync(contractController.updateContract)
);

// Auto-save endpoint for frequent updates in contract editor
router.patch(
	'/:contractId/autosave',
	authenticate(),
	validate(contractValidation.autoSaveContract),
	catchAsync(contractController.autoSaveContract)
);

router.get('/:contractId', authenticate(), validate(contractValidation.getContract), catchAsync(contractController.getContract));
router.get('/', authenticate(), validate(contractValidation.getUserContracts), catchAsync(contractController.getUserContracts));

router.delete(
	'/:contractId',
	authenticate(),
	validate(contractValidation.deleteContract),
	catchAsync(contractController.deleteContract)
);

// AI-powered contract operations
router.post(
	'/generate-sections',
	authenticate(),
	validate(contractValidation.generateSections),
	catchAsync(contractController.generateContractSections)
);
router.post(
	'/rewrite-section',
	authenticate(),
	validate(contractValidation.rewriteSection),
	catchAsync(contractController.rewriteSection)
);
// Shareable contract routes
router.post(
	'/:contractId/share',
	authenticate(),
	validate(contractValidation.generateShareableLink),
	catchAsync(contractController.generateShareableLink)
);

router.get(
	'/shared/:shareToken',
	authenticate(),
	validate(contractValidation.accessSharedContract),
	catchAsync(contractController.accessSharedContract)
);

// Access request routes
router.post(
	'/shared/:shareToken/request',
	validate(contractValidation.requestContractAccess),
	catchAsync(contractController.requestContractAccess)
);

router.put(
	'/shared/:shareToken/request/:email',
	authenticate(),
	validate(contractValidation.updateAccessRequest),
	catchAsync(contractController.updateAccessRequest)
);

// Contract analysis route
router.post(
	'/:contractId/analyze',
	authenticate(),
	validate(contractValidation.analyzeContract),
	catchAsync(contractController.analyzeContract)
);

// Market comparison route
router.post(
	'/:contractId/market-comparison',
	authenticate(),
	validate(contractValidation.compareMarketStandards),
	catchAsync(contractController.compareMarketStandards)
);

// Contract template routes
router.post(
	'/:contractId/save-template',
	authenticate(),
	validate(contractValidation.saveAsTemplate),
	catchAsync(contractController.saveAsTemplate)
);

// Contract comment routes
router.post(
	'/:contractId/comments',
	authenticate(),
	validate(contractValidation.addContractComment),
	catchAsync(contractController.addContractComment)
);

router.get(
	'/:contractId/comments',
	authenticate(),
	validate(contractValidation.getContractComments),
	catchAsync(contractController.getContractComments)
);

router.put(
	'/:contractId/comments/:commentId/resolve',
	authenticate(),
	validate(contractValidation.resolveContractComment),
	catchAsync(contractController.resolveContractComment)
);

// Preview health check route (must come before /:contractId/preview)
// Temporarily removing rate limiter to stop the flood of errors
router.get('/health/preview', catchAsync(contractController.checkPreviewHealth));

// Contract preview route
router.get('/:contractId/preview', authenticate(), catchAsync(contractController.generateContractPreview));

router.post(
	'/:contractId/send-email',
	authenticate(),
	validate(contractValidation.sendContractEmail),
	catchAsync(contractController.sendContractEmail)
);

// Health check endpoints
router.get('/health/ai', authenticate(), catchAsync(contractController.checkAIHealth));
router.get('/health/cache', authenticate(), catchAsync(contractController.getCacheHealth));
router.get('/health/third-party', authenticate(), catchAsync(contractController.checkThirdPartyAPIs));

router.patch('/:contractId/favorite', authenticate(), catchAsync(contractController.addToFavorite));
router.patch('/:contractId/unfavorite', authenticate(), catchAsync(contractController.removeFromFavorite));

// Fetch all conversation actions for a contract
router.get('/:contractId/conversation-actions', authenticate(), catchAsync(contractController.getConversationActions));

// Get contract conversation history
router.get('/:contractId/conversation', authenticate(), catchAsync(contractController.getContractConversation));

// Download contract as PDF
router.get(
	'/:contractId/download-pdf',
	authenticate(),
	validate(contractValidation.downloadContractPDF),
	catchAsync(contractController.downloadContractPDF)
);

export default router;
