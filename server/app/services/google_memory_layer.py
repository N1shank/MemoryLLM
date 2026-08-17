import asyncio
import logging
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from app.core.database import async_session
from app.models.user import User

logger = logging.getLogger(__name__)

async def initialize_google_memory_layer(access_token: str, refresh_token: str, user_id: int):
    """
    Initialize the Google Drive structured memory layer.
    Creates a master folder and 3 Google Docs for Facts, Skills, and Projects.
    All synchronous Google API calls are offloaded to a thread to avoid blocking the event loop.
    """
    try:
        logger.info(f"Initializing Google Memory Layer for user {user_id}...")
        
        from app.core.config import settings
        
        creds = Credentials(
            token=access_token,
            refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=settings.GOOGLE_CLIENT_ID,
            client_secret=settings.GOOGLE_CLIENT_SECRET,
        )
        
        drive_service = await asyncio.to_thread(build, 'drive', 'v3', credentials=creds)
        
        # 1. Create the main folder
        folder_metadata = {
            'name': '🧠 MemoryLLM Core Dashboard',
            'mimeType': 'application/vnd.google-apps.folder'
        }
        folder = await asyncio.to_thread(
            drive_service.files().create(body=folder_metadata, fields='id').execute
        )
        folder_id = folder.get('id')
        
        logger.info(f"Created main folder with ID {folder_id}")
        
        # 2. Create the 3 Documents inside the folder
        docs_to_create = [
            {"title": "📚 Facts & Notes", "role": "facts", "description": "Auto-generated document for AI memory facts."},
            {"title": "🛠️ Skills & Capabilities", "role": "skills", "description": "Auto-generated document for AI skills."},
            {"title": "📋 Projects & Tasks", "role": "projects", "description": "Auto-generated document for AI tasks."}
        ]
        
        memory_files = []
        memory_files.append({"role": "dashboard", "id": folder_id, "title": "MemoryLLM Dashboard"})
        
        docs_service = await asyncio.to_thread(build, 'docs', 'v1', credentials=creds)
        
        for doc_info in docs_to_create:
            # Create a Document
            doc_metadata = {
                'name': doc_info['title'],
                'mimeType': 'application/vnd.google-apps.document',
                'parents': [folder_id]
            }
            file = await asyncio.to_thread(
                drive_service.files().create(body=doc_metadata, fields='id').execute
            )
            doc_id = file.get('id')
            
            # Write a header into the doc
            requests = [
                {
                    'insertText': {
                        'location': {
                            'index': 1,
                        },
                        'text': f"{doc_info['title']}\n\n{doc_info['description']}\n\n"
                    }
                }
            ]
            
            await asyncio.to_thread(
                docs_service.documents().batchUpdate(documentId=doc_id, body={'requests': requests}).execute
            )
            
            memory_files.append({"role": doc_info["role"], "id": doc_id, "title": doc_info["title"]})
            logger.info(f"Created doc '{doc_info['title']}' with ID {doc_id}")
            
        # 3. Update the User model
        async with async_session() as db:
            user = await db.get(User, user_id)
            if user:
                user.google_files = memory_files
                db.add(user)
                await db.commit()
                logger.info(f"Successfully linked Google Memory Layer to user {user_id}")
                
    except Exception as e:
        logger.error(f"Failed to initialize Google Memory Layer: {str(e)}", exc_info=True)
