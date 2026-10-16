import { JobRestartPolicy, AgentDispatch } from '@livekit/protocol';
import { ClientOptions } from './ClientOptions.js';
import { ServiceBase } from './ServiceBase.js';
import './grants.js';
import 'jose';

interface CreateDispatchOptions {
    /** any custom data to send along with the job.
     * note: this is different from room and participant metadata
     */
    metadata?: string;
    /** controls whether the job should be restarted when it fails (cloud only) */
    restartPolicy?: JobRestartPolicy;
    /** optional deployment to dispatch to. Leave empty to target the production deployment. */
    deployment?: string;
}
/**
 * Client to access Agent APIs
 */
declare class AgentDispatchClient extends ServiceBase {
    private readonly rpc;
    /**
     * @param host - hostname including protocol. i.e. 'https://<project>.livekit.cloud'
     * @param apiKey - API Key, can be set in env var LIVEKIT_API_KEY
     * @param secret - API Secret, can be set in env var LIVEKIT_API_SECRET
     * @param options - client options
     */
    constructor(host: string, apiKey?: string, secret?: string, options?: ClientOptions);
    /**
     * Create an explicit dispatch for an agent to join a room. To use explicit
     * dispatch, your agent must be registered with an `agentName`.
     * @param roomName - name of the room to dispatch to
     * @param agentName - name of the agent to dispatch
     * @param options - optional metadata to send along with the dispatch
     * @returns the dispatch that was created
     */
    createDispatch(roomName: string, agentName: string, options?: CreateDispatchOptions): Promise<AgentDispatch>;
    /**
     * Delete an explicit dispatch for an agent in a room.
     * @param dispatchId - id of the dispatch to delete
     * @param roomName - name of the room the dispatch is for
     */
    deleteDispatch(dispatchId: string, roomName: string): Promise<void>;
    /**
     * Get an Agent dispatch by ID
     * @param dispatchId - id of the dispatch to get
     * @param roomName - name of the room the dispatch is for
     * @returns the dispatch that was found, or undefined if not found
     */
    getDispatch(dispatchId: string, roomName: string): Promise<AgentDispatch | undefined>;
    /**
     * List all agent dispatches for a room
     * @param roomName - name of the room to list dispatches for
     * @returns the list of dispatches
     */
    listDispatch(roomName: string): Promise<AgentDispatch[]>;
}

export { AgentDispatchClient };
