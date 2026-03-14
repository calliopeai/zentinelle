'use client';

import React, { useState, useCallback } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Input,
  Textarea,
  useColorModeValue,
  Card,
  CardBody,
  CardHeader,
  Heading,
  Badge,
  Progress,
  Icon,
  useToast,
  Divider,
  List,
  ListItem,
  ListIcon,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Alert,
  AlertIcon,
  Spinner,
  Flex,
  IconButton,
} from '@chakra-ui/react';
import {
  MdUpload,
  MdDescription,
  MdCheckCircle,
  MdError,
  MdAutoAwesome,
  MdRefresh,
  MdDelete,
  MdVisibility,
} from 'react-icons/md';
import { useMutation, useQuery, gql } from '@apollo/client';

// GraphQL Mutations and Queries
const UPLOAD_POLICY_DOCUMENT = gql`
  mutation UploadPolicyDocument(
    $organizationId: UUID!
    $name: String!
    $description: String
    $documentType: String!
    $fileContentBase64: String!
  ) {
    uploadPolicyDocument(
      organizationId: $organizationId
      name: $name
      description: $description
      documentType: $documentType
      fileContentBase64: $fileContentBase64
    ) {
      success
      error
      document {
        id
        name
        status
        pageCount
        wordCount
        extractedTextPreview
      }
    }
  }
`;

const ANALYZE_POLICY_DOCUMENT = gql`
  mutation AnalyzePolicyDocument($documentId: UUID!, $model: String) {
    analyzePolicyDocument(documentId: $documentId, model: $model) {
      success
      error
      document {
        id
        status
        analysisResults
        generatedPromptCount
      }
      extractedPrompts {
        category
        title
        promptText
        sourceExcerpt
        confidence
      }
    }
  }
`;

const GET_POLICY_DOCUMENTS = gql`
  query GetPolicyDocuments($status: String) {
    policyDocuments(status: $status) {
      id
      name
      description
      documentType
      status
      pageCount
      wordCount
      generatedPromptCount
      createdAt
    }
  }
`;

const DELETE_POLICY_DOCUMENT = gql`
  mutation DeletePolicyDocument($documentId: UUID!) {
    deletePolicyDocument(documentId: $documentId) {
      success
      error
    }
  }
`;

interface PolicyDocumentUploadProps {
  organizationId: string;
}

interface ExtractedPrompt {
  category: string;
  title: string;
  promptText: string;
  sourceExcerpt: string;
  confidence: number;
}

interface PolicyDocument {
  id: string;
  name: string;
  description?: string;
  documentType: string;
  status: string;
  pageCount: number;
  wordCount: number;
  generatedPromptCount: number;
  createdAt: string;
}

const statusColors: Record<string, string> = {
  pending: 'yellow',
  processing: 'blue',
  extracted: 'cyan',
  analyzed: 'green',
  failed: 'red',
};

export default function PolicyDocumentUpload({ organizationId }: PolicyDocumentUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentName, setDocumentName] = useState('');
  const [description, setDescription] = useState('');
  const [extractedPrompts, setExtractedPrompts] = useState<ExtractedPrompt[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<string | null>(null);

  const toast = useToast();
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  // Queries
  const { data: documentsData, loading: loadingDocuments, refetch } = useQuery(GET_POLICY_DOCUMENTS);

  // Mutations
  const [uploadDocument, { loading: uploading }] = useMutation(UPLOAD_POLICY_DOCUMENT);
  const [analyzeDocument, { loading: analyzing }] = useMutation(ANALYZE_POLICY_DOCUMENT);
  const [deleteDocument] = useMutation(DELETE_POLICY_DOCUMENT);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: 'Invalid file type',
          description: 'Please upload a PDF, DOCX, or TXT file.',
          status: 'error',
          duration: 5000,
        });
        return;
      }

      // Validate file size (10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: 'File too large',
          description: 'Maximum file size is 10MB.',
          status: 'error',
          duration: 5000,
        });
        return;
      }

      setSelectedFile(file);
      if (!documentName) {
        setDocumentName(file.name.replace(/\.[^/.]+$/, ''));
      }
    }
  }, [documentName, toast]);

  const handleUpload = useCallback(async () => {
    if (!selectedFile || !documentName) {
      toast({
        title: 'Missing information',
        description: 'Please select a file and enter a name.',
        status: 'warning',
        duration: 3000,
      });
      return;
    }

    // Convert file to base64
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];

      // Determine document type
      let documentType = 'pdf';
      if (selectedFile.type.includes('wordprocessingml')) {
        documentType = 'docx';
      } else if (selectedFile.type === 'text/plain') {
        documentType = 'txt';
      }

      try {
        const result = await uploadDocument({
          variables: {
            organizationId,
            name: documentName,
            description,
            documentType,
            fileContentBase64: base64,
          },
        });

        if (result.data?.uploadPolicyDocument?.success) {
          toast({
            title: 'Document uploaded',
            description: 'Text extraction complete. Ready for analysis.',
            status: 'success',
            duration: 5000,
          });
          setSelectedFile(null);
          setDocumentName('');
          setDescription('');
          setSelectedDocument(result.data.uploadPolicyDocument.document.id);
          refetch();
        } else {
          throw new Error(result.data?.uploadPolicyDocument?.error || 'Upload failed');
        }
      } catch (error: any) {
        toast({
          title: 'Upload failed',
          description: error.message,
          status: 'error',
          duration: 5000,
        });
      }
    };
    reader.readAsDataURL(selectedFile);
  }, [selectedFile, documentName, description, organizationId, uploadDocument, toast, refetch]);

  const handleAnalyze = useCallback(async (documentId: string) => {
    try {
      const result = await analyzeDocument({
        variables: {
          documentId,
          model: 'gpt-4o-mini',
        },
      });

      if (result.data?.analyzePolicyDocument?.success) {
        setExtractedPrompts(result.data.analyzePolicyDocument.extractedPrompts || []);
        toast({
          title: 'Analysis complete',
          description: `Generated ${result.data.analyzePolicyDocument.document.generatedPromptCount} prompts.`,
          status: 'success',
          duration: 5000,
        });
        refetch();
      } else {
        throw new Error(result.data?.analyzePolicyDocument?.error || 'Analysis failed');
      }
    } catch (error: any) {
      toast({
        title: 'Analysis failed',
        description: error.message,
        status: 'error',
        duration: 5000,
      });
    }
  }, [analyzeDocument, toast, refetch]);

  const handleDelete = useCallback(async (documentId: string) => {
    try {
      await deleteDocument({ variables: { documentId } });
      toast({
        title: 'Document deleted',
        status: 'success',
        duration: 3000,
      });
      if (selectedDocument === documentId) {
        setSelectedDocument(null);
        setExtractedPrompts([]);
      }
      refetch();
    } catch (error: any) {
      toast({
        title: 'Delete failed',
        description: error.message,
        status: 'error',
        duration: 5000,
      });
    }
  }, [deleteDocument, selectedDocument, toast, refetch]);

  const documents: PolicyDocument[] = documentsData?.policyDocuments || [];

  return (
    <VStack spacing={6} align="stretch">
      {/* Upload Section */}
      <Card bg={bgColor}>
        <CardHeader>
          <Heading size="md">
            <HStack>
              <Icon as={MdUpload} />
              <Text>Upload Policy Document</Text>
            </HStack>
          </Heading>
        </CardHeader>
        <CardBody>
          <VStack spacing={4} align="stretch">
            <Box
              border="2px dashed"
              borderColor={borderColor}
              borderRadius="md"
              p={6}
              textAlign="center"
            >
              <Input
                type="file"
                accept=".pdf,.docx,.txt"
                onChange={handleFileChange}
                display="none"
                id="file-upload"
              />
              <label htmlFor="file-upload">
                <Button as="span" leftIcon={<MdUpload />} colorScheme="blue" cursor="pointer">
                  Select File
                </Button>
              </label>
              <Text mt={2} fontSize="sm" color="gray.500">
                Supported: PDF, DOCX, TXT (max 10MB)
              </Text>
              {selectedFile && (
                <HStack mt={3} justify="center">
                  <Icon as={MdDescription} color="blue.500" />
                  <Text>{selectedFile.name}</Text>
                  <Badge>{(selectedFile.size / 1024).toFixed(1)} KB</Badge>
                </HStack>
              )}
            </Box>

            <Input
              placeholder="Document name"
              value={documentName}
              onChange={(e) => setDocumentName(e.target.value)}
            />

            <Textarea
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />

            <Button
              colorScheme="blue"
              onClick={handleUpload}
              isLoading={uploading}
              isDisabled={!selectedFile || !documentName}
            >
              Upload & Extract Text
            </Button>
          </VStack>
        </CardBody>
      </Card>

      {/* Documents List */}
      <Card bg={bgColor}>
        <CardHeader>
          <HStack justify="space-between">
            <Heading size="md">Uploaded Documents</Heading>
            <IconButton
              aria-label="Refresh"
              icon={<MdRefresh />}
              size="sm"
              onClick={() => refetch()}
            />
          </HStack>
        </CardHeader>
        <CardBody>
          {loadingDocuments ? (
            <Flex justify="center" py={8}>
              <Spinner />
            </Flex>
          ) : documents.length === 0 ? (
            <Alert status="info">
              <AlertIcon />
              No documents uploaded yet. Upload a policy document to get started.
            </Alert>
          ) : (
            <VStack spacing={3} align="stretch">
              {documents.map((doc) => (
                <Box
                  key={doc.id}
                  p={4}
                  borderWidth="1px"
                  borderRadius="md"
                  borderColor={selectedDocument === doc.id ? 'blue.500' : borderColor}
                  cursor="pointer"
                  onClick={() => setSelectedDocument(doc.id)}
                  _hover={{ borderColor: 'blue.300' }}
                >
                  <HStack justify="space-between">
                    <VStack align="start" spacing={1}>
                      <HStack>
                        <Text fontWeight="bold">{doc.name}</Text>
                        <Badge colorScheme={statusColors[doc.status] || 'gray'}>
                          {doc.status}
                        </Badge>
                        <Badge variant="outline">{doc.documentType.toUpperCase()}</Badge>
                      </HStack>
                      <HStack fontSize="sm" color="gray.500">
                        <Text>{doc.pageCount} pages</Text>
                        <Text>|</Text>
                        <Text>{doc.wordCount.toLocaleString()} words</Text>
                        {doc.generatedPromptCount > 0 && (
                          <>
                            <Text>|</Text>
                            <Text color="green.500">{doc.generatedPromptCount} prompts</Text>
                          </>
                        )}
                      </HStack>
                    </VStack>
                    <HStack>
                      {doc.status === 'extracted' && (
                        <Button
                          size="sm"
                          colorScheme="purple"
                          leftIcon={<MdAutoAwesome />}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAnalyze(doc.id);
                          }}
                          isLoading={analyzing && selectedDocument === doc.id}
                        >
                          Analyze
                        </Button>
                      )}
                      <IconButton
                        aria-label="Delete"
                        icon={<MdDelete />}
                        size="sm"
                        colorScheme="red"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(doc.id);
                        }}
                      />
                    </HStack>
                  </HStack>
                </Box>
              ))}
            </VStack>
          )}
        </CardBody>
      </Card>

      {/* Extracted Prompts */}
      {extractedPrompts.length > 0 && (
        <Card bg={bgColor}>
          <CardHeader>
            <Heading size="md">
              <HStack>
                <Icon as={MdAutoAwesome} color="purple.500" />
                <Text>Extracted Prompts ({extractedPrompts.length})</Text>
              </HStack>
            </Heading>
          </CardHeader>
          <CardBody>
            <Accordion allowMultiple>
              {extractedPrompts.map((prompt, index) => (
                <AccordionItem key={index}>
                  <h3>
                    <AccordionButton>
                      <HStack flex="1" textAlign="left">
                        <Badge colorScheme="purple">{prompt.category}</Badge>
                        <Text fontWeight="medium">{prompt.title}</Text>
                        <Badge colorScheme={prompt.confidence > 0.8 ? 'green' : 'yellow'}>
                          {(prompt.confidence * 100).toFixed(0)}%
                        </Badge>
                      </HStack>
                      <AccordionIcon />
                    </AccordionButton>
                  </h3>
                  <AccordionPanel pb={4}>
                    <VStack align="stretch" spacing={3}>
                      <Box>
                        <Text fontSize="sm" fontWeight="bold" color="gray.500" mb={1}>
                          Prompt Text
                        </Text>
                        <Box
                          p={3}
                          bg={useColorModeValue('gray.50', 'gray.700')}
                          borderRadius="md"
                          fontSize="sm"
                          fontFamily="mono"
                        >
                          {prompt.promptText}
                        </Box>
                      </Box>
                      {prompt.sourceExcerpt && (
                        <Box>
                          <Text fontSize="sm" fontWeight="bold" color="gray.500" mb={1}>
                            Source Excerpt
                          </Text>
                          <Text fontSize="sm" fontStyle="italic" color="gray.600">
                            "{prompt.sourceExcerpt}"
                          </Text>
                        </Box>
                      )}
                    </VStack>
                  </AccordionPanel>
                </AccordionItem>
              ))}
            </Accordion>
            <Divider my={4} />
            <Alert status="info">
              <AlertIcon />
              <Text fontSize="sm">
                These prompts have been saved as drafts. Review and activate them in the System Prompts section.
              </Text>
            </Alert>
          </CardBody>
        </Card>
      )}
    </VStack>
  );
}
